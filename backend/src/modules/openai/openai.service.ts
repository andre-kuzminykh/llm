import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface TranscriptionResult {
  text: string;
  durationSeconds: number;
  model: string;
}

@Injectable()
export class OpenAIService {
  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
    });
  }

  async chatCompletion(
    model: string,
    messages: ChatMessage[],
  ): Promise<ChatCompletionResult> {
    const input = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    const response = await this.client.responses.create({
      model,
      input,
    });

    return {
      content: response.output_text,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      model: response.model,
    };
  }

  async *chatCompletionStream(
    model: string,
    messages: ChatMessage[],
  ): AsyncGenerator<{ type: 'delta' | 'done'; text?: string; inputTokens?: number; outputTokens?: number }> {
    const input = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    const stream = await this.client.responses.create({
      model,
      input,
      stream: true,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield { type: 'delta', text: event.delta };
      }
      if (event.type === 'response.completed') {
        inputTokens = event.response.usage?.input_tokens ?? 0;
        outputTokens = event.response.usage?.output_tokens ?? 0;
      }
    }

    yield { type: 'done', inputTokens, outputTokens };
  }

  async transcribeAudio(
    filePath: string,
    model?: string,
  ): Promise<TranscriptionResult> {
    const transcriptionModel = model
      || this.configService.get('DEFAULT_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe');

    const file = fs.createReadStream(filePath);

    const response = await this.client.audio.transcriptions.create({
      model: transcriptionModel as any,
      file,
      response_format: 'verbose_json',
    });

    const result = response as any;

    return {
      text: result.text ?? '',
      durationSeconds: result.duration ?? 0,
      model: transcriptionModel!,
    };
  }
}
