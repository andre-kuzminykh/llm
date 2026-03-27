import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService, ChatMessage } from '../openai/openai.service';
import { WalletService } from '../wallet/wallet.service';
import { DEFAULT_ALLOWED_MODELS } from '../../config/prices';
import * as fs from 'fs';
import * as path from 'path';

export interface SendMessageResult {
  assistantMessageId: string;
  content: string;
  model: string;
  costUsd: number;
  balanceUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SendVoiceResult extends SendMessageResult {
  transcriptText: string;
  transcriptionCostUsd: number;
  llmCostUsd: number;
  totalCostUsd: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
    private wallet: WalletService,
  ) {}

  async createSession(userId: string, model?: string) {
    const selectedModel = model || 'gpt-4o-mini';
    if (!DEFAULT_ALLOWED_MODELS.includes(selectedModel)) {
      throw new BadRequestException(`Model ${selectedModel} is not available`);
    }

    return this.prisma.chatSession.create({
      data: {
        userId,
        model: selectedModel,
      },
    });
  }

  async getSession(sessionId: string) {
    return this.prisma.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
  }

  async getUserSessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async getMessages(sessionId: string) {
    return this.prisma.message.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: 'asc' },
      include: { audioTranscript: true },
    });
  }

  async sendMessage(
    userId: string,
    sessionId: string,
    text: string,
  ): Promise<SendMessageResult> {
    const session = await this.prisma.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { user: true },
    });

    if (session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    if (session.user.isBlocked) {
      throw new ForbiddenException('Account is blocked');
    }

    // Check balance (rough estimate: at least $0.001)
    const hasBalance = await this.wallet.checkBalance(userId, 0.001);
    if (!hasBalance) {
      throw new BadRequestException('Insufficient balance');
    }

    // Save user message
    await this.prisma.message.create({
      data: {
        chatSessionId: sessionId,
        role: 'user',
        content: text,
      },
    });

    // Build context
    const history = await this.getMessages(sessionId);
    const messages: ChatMessage[] = history.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    // Call OpenAI
    const result = await this.openai.chatCompletion(session.model, messages);

    // Calculate cost
    const cost = this.wallet.calculateChatCost(
      session.model,
      result.inputTokens,
      result.outputTokens,
    );

    // Save assistant message
    const assistantMessage = await this.prisma.message.create({
      data: {
        chatSessionId: sessionId,
        role: 'assistant',
        content: result.content,
      },
    });

    // Save usage record
    const usageRecord = await this.prisma.usageRecord.create({
      data: {
        userId,
        messageId: assistantMessage.id,
        model: session.model,
        operationType: 'chat',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: cost.costUsd,
      },
    });

    // Debit wallet
    const newBalance = await this.wallet.debit(
      userId,
      cost.costUsd,
      `Chat: ${session.model} - ${cost.breakdown}`,
      usageRecord.id,
    );

    // Update session timestamp
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return {
      assistantMessageId: assistantMessage.id,
      content: result.content,
      model: session.model,
      costUsd: cost.costUsd,
      balanceUsd: newBalance,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  async *sendMessageStream(
    userId: string,
    sessionId: string,
    text: string,
  ): AsyncGenerator<{ type: string; data: any }> {
    const session = await this.prisma.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { user: true },
    });

    if (session.userId !== userId) throw new ForbiddenException('Not your session');
    if (session.user.isBlocked) throw new ForbiddenException('Account is blocked');

    const hasBalance = await this.wallet.checkBalance(userId, 0.001);
    if (!hasBalance) throw new BadRequestException('Insufficient balance');

    await this.prisma.message.create({
      data: { chatSessionId: sessionId, role: 'user', content: text },
    });

    const history = await this.getMessages(sessionId);
    const messages: ChatMessage[] = history.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    let fullContent = '';

    for await (const event of this.openai.chatCompletionStream(session.model, messages)) {
      if (event.type === 'delta' && event.text) {
        fullContent += event.text;
        yield { type: 'delta', data: { text: event.text } };
      }

      if (event.type === 'done') {
        const cost = this.wallet.calculateChatCost(
          session.model,
          event.inputTokens!,
          event.outputTokens!,
        );

        const assistantMessage = await this.prisma.message.create({
          data: { chatSessionId: sessionId, role: 'assistant', content: fullContent },
        });

        const usageRecord = await this.prisma.usageRecord.create({
          data: {
            userId,
            messageId: assistantMessage.id,
            model: session.model,
            operationType: 'chat',
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            costUsd: cost.costUsd,
          },
        });

        const newBalance = await this.wallet.debit(
          userId,
          cost.costUsd,
          `Chat: ${session.model} - ${cost.breakdown}`,
          usageRecord.id,
        );

        await this.prisma.chatSession.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() },
        });

        yield {
          type: 'done',
          data: {
            assistantMessageId: assistantMessage.id,
            model: session.model,
            costUsd: cost.costUsd,
            balanceUsd: newBalance,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          },
        };
      }
    }
  }

  async sendVoiceMessage(
    userId: string,
    sessionId: string,
    filePath: string,
  ): Promise<SendVoiceResult> {
    const session = await this.prisma.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { user: true },
    });

    if (session.userId !== userId) throw new ForbiddenException('Not your session');
    if (session.user.isBlocked) throw new ForbiddenException('Account is blocked');

    const hasBalance = await this.wallet.checkBalance(userId, 0.01);
    if (!hasBalance) throw new BadRequestException('Insufficient balance');

    // Transcribe
    const transcript = await this.openai.transcribeAudio(filePath);

    // Calculate transcription cost
    const transcriptionCost = this.wallet.calculateTranscriptionCost(
      transcript.model,
      transcript.durationSeconds,
    );

    // Save user message with transcript
    const userMessage = await this.prisma.message.create({
      data: {
        chatSessionId: sessionId,
        role: 'user',
        content: transcript.text,
        audioTranscript: {
          create: {
            originalFileName: path.basename(filePath),
            durationSeconds: transcript.durationSeconds,
            transcriptText: transcript.text,
            transcriptionModel: transcript.model,
          },
        },
      },
    });

    // Save transcription usage
    await this.prisma.usageRecord.create({
      data: {
        userId,
        model: transcript.model,
        operationType: 'transcription',
        audioDurationSec: transcript.durationSeconds,
        costUsd: transcriptionCost.costUsd,
      },
    });

    // Debit transcription cost
    await this.wallet.debit(
      userId,
      transcriptionCost.costUsd,
      `Transcription: ${transcript.model} - ${transcriptionCost.breakdown}`,
    );

    // Now send the transcribed text as a chat message
    const history = await this.getMessages(sessionId);
    const messages: ChatMessage[] = history.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    const result = await this.openai.chatCompletion(session.model, messages);

    const chatCost = this.wallet.calculateChatCost(
      session.model,
      result.inputTokens,
      result.outputTokens,
    );

    const assistantMessage = await this.prisma.message.create({
      data: { chatSessionId: sessionId, role: 'assistant', content: result.content },
    });

    const usageRecord = await this.prisma.usageRecord.create({
      data: {
        userId,
        messageId: assistantMessage.id,
        model: session.model,
        operationType: 'chat',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: chatCost.costUsd,
      },
    });

    const newBalance = await this.wallet.debit(
      userId,
      chatCost.costUsd,
      `Chat: ${session.model} - ${chatCost.breakdown}`,
      usageRecord.id,
    );

    // Clean up audio file
    try { fs.unlinkSync(filePath); } catch {}

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return {
      assistantMessageId: assistantMessage.id,
      content: result.content,
      model: session.model,
      costUsd: chatCost.costUsd,
      balanceUsd: newBalance,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      transcriptText: transcript.text,
      transcriptionCostUsd: transcriptionCost.costUsd,
      llmCostUsd: chatCost.costUsd,
      totalCostUsd: transcriptionCost.costUsd + chatCost.costUsd,
    };
  }
}
