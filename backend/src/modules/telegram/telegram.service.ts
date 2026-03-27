import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { UserService } from '../user/user.service';
import { WalletService } from '../wallet/wallet.service';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { DEFAULT_ALLOWED_MODELS } from '../../config/prices';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  readonly bot: Bot;
  private userSessions: Map<bigint, string> = new Map(); // telegramId -> chatSessionId
  private userModels: Map<bigint, string> = new Map(); // telegramId -> selected model

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private chatService: ChatService,
    private userService: UserService,
    private wallet: WalletService,
    private admin: AdminService,
    private auth: AuthService,
  ) {
    this.bot = new Bot(this.configService.getOrThrow('TELEGRAM_BOT_TOKEN'));
  }

  async onModuleInit() {
    this.setupHandlers();

    // Set bot menu commands (visible in hamburger menu)
    await this.bot.api.setMyCommands([
      { command: 'new', description: 'Start a new chat' },
      { command: 'models', description: 'Choose a model' },
      { command: 'balance', description: 'Check your balance' },
    ]);

    const webhookUrl = this.configService.get('TELEGRAM_WEBHOOK_URL');
    if (webhookUrl) {
      const secret = this.configService.get('TELEGRAM_WEBHOOK_SECRET', '');
      await this.bot.api.setWebhook(webhookUrl, { secret_token: secret });
      this.logger.log(`Webhook set to ${webhookUrl}`);
    } else {
      // Polling mode for development
      this.bot.start();
      this.logger.log('Bot started in polling mode');
    }
  }

  private setupHandlers() {
    // /start command
    this.bot.command('start', async (ctx) => {
      const from = ctx.from!;
      await this.userService.findOrCreateByTelegram(
        BigInt(from.id),
        from.username,
        from.first_name,
        from.last_name ?? undefined,
      );

      // Check if this is a login confirmation deep link
      const payload = ctx.match;
      if (payload?.startsWith('login_')) {
        await this.handleLoginConfirmation(ctx, payload);
        return;
      }

      await ctx.reply(
        `Welcome! I'm your AI assistant.\n\n` +
        `Commands:\n` +
        `/new — Start a new chat\n` +
        `/models — Choose a model\n` +
        `/balance — Check your balance\n\n` +
        `Just send me a text or voice message to chat!`,
      );
    });

    // /new command — start new chat, then offer model selection
    this.bot.command('new', async (ctx) => {
      const user = await this.ensureUser(ctx);
      if (!user) return;

      const telegramId = BigInt(ctx.from!.id);
      const currentModel = this.userModels.get(telegramId) || 'gpt-4o-mini';
      const session = await this.chatService.createSession(user.id, currentModel);
      this.userSessions.set(telegramId, session.id);

      const keyboard = this.buildModelKeyboard(currentModel);
      await ctx.reply(
        `New chat started.\nModel: ${currentModel}\n\nChange model or just send a message:`,
        { reply_markup: keyboard },
      );
    });

    // /models command — show model selection as inline buttons
    this.bot.command('models', async (ctx) => {
      const user = await this.ensureUser(ctx);
      if (!user) return;

      const telegramId = BigInt(ctx.from!.id);
      const currentModel = this.userModels.get(telegramId) || 'gpt-4o-mini';
      const keyboard = this.buildModelKeyboard(currentModel);
      await ctx.reply('Choose a model:', { reply_markup: keyboard });
    });

    // /balance command
    this.bot.command('balance', async (ctx) => {
      const user = await this.ensureUser(ctx);
      if (!user) return;
      const balance = await this.wallet.getBalance(user.id);
      await ctx.reply(`Your balance: $${balance.toFixed(6)}`);
    });

    // Model selection callback
    this.bot.callbackQuery(/^model:(.+)$/, async (ctx) => {
      const model = ctx.match![1];
      const user = await this.ensureUser(ctx);
      if (!user) return;

      const telegramId = BigInt(ctx.from!.id);
      this.userModels.set(telegramId, model);

      // Create new session with selected model
      const session = await this.chatService.createSession(user.id, model);
      this.userSessions.set(telegramId, session.id);

      const keyboard = this.buildModelKeyboard(model);
      await ctx.answerCallbackQuery({ text: `Model: ${model}` });
      await ctx.editMessageText(
        `Model: ${model}\nNew chat started. Send me a message!`,
        { reply_markup: keyboard },
      );
    });

    // Login confirmation callback
    this.bot.callbackQuery(/^confirm_login:(.+)$/, async (ctx) => {
      const challengeId = ctx.match![1];
      try {
        const challenge = await this.prisma.authChallenge.findUnique({
          where: { id: challengeId },
        });
        if (!challenge || challenge.confirmed || challenge.expiresAt < new Date()) {
          await ctx.answerCallbackQuery({ text: 'Login expired or already used' });
          return;
        }
        await this.prisma.authChallenge.update({
          where: { id: challengeId },
          data: { confirmed: true, usedAt: new Date() },
        });
        await ctx.answerCallbackQuery({ text: 'Login confirmed!' });
        await ctx.editMessageText('✓ Web login confirmed. You can now use the web app.');
      } catch {
        await ctx.answerCallbackQuery({ text: 'Error confirming login' });
      }
    });

    // Admin commands (hidden)
    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message!.text;
      const telegramId = BigInt(ctx.from!.id);

      // Try admin commands first
      if (this.admin.isAdmin(telegramId)) {
        const adminResult = await this.handleAdminCommand(telegramId, text);
        if (adminResult) {
          await ctx.reply(adminResult);
          return;
        }
      }

      // Regular text message → chat
      await this.handleTextMessage(ctx);
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      await this.handleVoiceMessage(ctx);
    });

    // Audio files
    this.bot.on('message:audio', async (ctx) => {
      await this.handleVoiceMessage(ctx);
    });
  }

  private buildModelKeyboard(currentModel: string): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    for (const model of DEFAULT_ALLOWED_MODELS) {
      const label = model === currentModel ? `✓ ${model}` : model;
      keyboard.text(label, `model:${model}`).row();
    }
    return keyboard;
  }

  private async handleLoginConfirmation(ctx: Context, payload: string) {
    const challengeId = payload.replace('login_', '');
    const keyboard = new InlineKeyboard()
      .text('✓ Confirm login', `confirm_login:${challengeId}`);
    await ctx.reply(
      'Someone is trying to log into the web app with your account.\n\nIf this was you, tap the button below to confirm:',
      { reply_markup: keyboard },
    );
  }

  private async handleAdminCommand(telegramId: bigint, text: string): Promise<string | null> {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
      case '/add_credit': {
        const username = parts[1]?.replace('@', '');
        const amount = parseFloat(parts[2]);
        if (!username || isNaN(amount) || amount <= 0) return 'Usage: /add_credit @username amount';
        return this.admin.addCredit(telegramId, username, amount);
      }
      case '/remove_credit': {
        const username = parts[1]?.replace('@', '');
        const amount = parseFloat(parts[2]);
        if (!username || isNaN(amount) || amount <= 0) return 'Usage: /remove_credit @username amount';
        return this.admin.removeCredit(telegramId, username, amount);
      }
      case '/balance_of': {
        const username = parts[1]?.replace('@', '');
        if (!username) return 'Usage: /balance_of @username';
        return this.admin.getBalanceOf(telegramId, username);
      }
      case '/block_user': {
        const username = parts[1]?.replace('@', '');
        if (!username) return 'Usage: /block_user @username';
        return this.admin.blockUser(telegramId, username);
      }
      case '/unblock_user': {
        const username = parts[1]?.replace('@', '');
        if (!username) return 'Usage: /unblock_user @username';
        return this.admin.unblockUser(telegramId, username);
      }
      case '/user_usage': {
        const username = parts[1]?.replace('@', '');
        const days = parseInt(parts[2]) || 30;
        if (!username) return 'Usage: /user_usage @username [days]';
        return this.admin.getUserUsage(telegramId, username, days);
      }
      default:
        return null;
    }
  }

  private async ensureUser(ctx: Context) {
    const from = ctx.from!;
    const user = await this.userService.findOrCreateByTelegram(
      BigInt(from.id),
      from.username,
      from.first_name,
      from.last_name ?? undefined,
    );

    if (user.isBlocked) {
      await ctx.reply('Your account is blocked. Contact support.');
      return null;
    }

    return user;
  }

  private async getOrCreateSession(user: any, telegramId: bigint) {
    const sessionId = this.userSessions.get(telegramId);
    if (sessionId) {
      try {
        const session = await this.chatService.getSession(sessionId);
        if (session.isActive) return session;
      } catch {}
    }

    const session = await this.chatService.createSession(user.id);
    this.userSessions.set(telegramId, session.id);
    return session;
  }

  private async handleTextMessage(ctx: Context) {
    const user = await this.ensureUser(ctx);
    if (!user) return;

    const telegramId = BigInt(ctx.from!.id);
    const session = await this.getOrCreateSession(user, telegramId);
    const text = ctx.message!.text!;

    try {
      await ctx.replyWithChatAction('typing');
      const result = await this.chatService.sendMessage(user.id, session.id, text);

      const costInfo = `\n\n💰 $${result.costUsd.toFixed(6)} | Balance: $${result.balanceUsd.toFixed(6)}`;
      const response = result.content + costInfo;

      // Telegram has a 4096 char limit
      if (response.length <= 4096) {
        await ctx.reply(response);
      } else {
        const chunks = this.splitMessage(response);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      }
    } catch (error: any) {
      this.logger.error('Chat error:', error.message);
      await ctx.reply(`Error: ${error.message}`);
    }
  }

  private async handleVoiceMessage(ctx: Context) {
    const user = await this.ensureUser(ctx);
    if (!user) return;

    const telegramId = BigInt(ctx.from!.id);
    const session = await this.getOrCreateSession(user, telegramId);

    try {
      await ctx.replyWithChatAction('typing');

      // Download voice file
      const file = await ctx.getFile();
      const filePath = await this.downloadTelegramFile(file.file_path!);

      const result = await this.chatService.sendVoiceMessage(user.id, session.id, filePath);

      const response = [
        `🎙 "${result.transcriptText}"`,
        '',
        result.content,
        '',
        `💰 Transcription: $${result.transcriptionCostUsd.toFixed(6)} | Chat: $${result.llmCostUsd.toFixed(6)} | Total: $${result.totalCostUsd.toFixed(6)}`,
        `Balance: $${result.balanceUsd.toFixed(6)}`,
      ].join('\n');

      if (response.length <= 4096) {
        await ctx.reply(response);
      } else {
        const chunks = this.splitMessage(response);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      }
    } catch (error: any) {
      this.logger.error('Voice error:', error.message);
      await ctx.reply(`Error processing voice: ${error.message}`);
    }
  }

  private async downloadTelegramFile(filePath: string): Promise<string> {
    const token = this.configService.getOrThrow('TELEGRAM_BOT_TOKEN');
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const uploadDir = this.configService.get('UPLOAD_DIR', './uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(filePath) || '.ogg';
    const localPath = path.join(uploadDir, `${Date.now()}${ext}`);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(localPath);
        });
      }).on('error', (err) => {
        fs.unlink(localPath, () => {});
        reject(err);
      });
    });
  }

  private splitMessage(text: string, maxLength = 4096): string[] {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1) splitIndex = maxLength;
      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trimStart();
    }
    return chunks;
  }

  // Called by AuthService to send login confirmation to user
  async sendLoginChallenge(telegramId: bigint, challengeId: string, code: string) {
    const keyboard = new InlineKeyboard()
      .text('✓ Confirm login', `confirm_login:${challengeId}`);

    await this.bot.api.sendMessage(
      telegramId.toString(),
      `Web login request.\n\nYour code: ${code}\n\nIf this was you, tap confirm:`,
      { reply_markup: keyboard },
    );
  }
}
