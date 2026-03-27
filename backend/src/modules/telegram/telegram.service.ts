import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context, InlineKeyboard, Keyboard } from 'grammy';
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

// Minimum interval between message edits (Telegram rate limit)
const EDIT_INTERVAL_MS = 1500;

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  readonly bot: Bot;
  private userSessions: Map<bigint, string> = new Map();
  private userModels: Map<bigint, string> = new Map();

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
      this.bot.start();
      this.logger.log('Bot started in polling mode');
    }
  }

  // Main keyboard: just two buttons
  private buildMainKeyboard(): Keyboard {
    return new Keyboard()
      .text('New Chat').text('Choose Model')
      .row()
      .resized()
      .persistent();
  }

  // Model selection keyboard: models in a column + back button
  private buildModelKeyboard(currentModel: string): Keyboard {
    const keyboard = new Keyboard();
    for (const model of DEFAULT_ALLOWED_MODELS) {
      const label = model === currentModel ? `✓ ${model}` : model;
      keyboard.text(label).row();
    }
    keyboard.text('« Back').row();
    keyboard.resized().persistent();
    return keyboard;
  }

  private setupHandlers() {
    // /start
    this.bot.command('start', async (ctx) => {
      const from = ctx.from!;
      await this.userService.findOrCreateByTelegram(
        BigInt(from.id), from.username, from.first_name, from.last_name ?? undefined,
      );

      const payload = ctx.match;
      if (payload?.startsWith('login_')) {
        await this.handleLoginConfirmation(ctx, payload);
        return;
      }

      await ctx.reply(
        `Welcome! I'm your AI assistant.\n\nJust send me a text or voice message to chat!`,
        { reply_markup: this.buildMainKeyboard() },
      );
    });

    // /new
    this.bot.command('new', async (ctx) => {
      const user = await this.ensureUser(ctx);
      if (!user) return;
      const telegramId = BigInt(ctx.from!.id);
      const currentModel = this.userModels.get(telegramId) || 'gpt-4o-mini';
      const session = await this.chatService.createSession(user.id, currentModel);
      this.userSessions.set(telegramId, session.id);
      await ctx.reply(`New chat started. Model: ${currentModel}`, {
        reply_markup: this.buildMainKeyboard(),
      });
    });

    // /models
    this.bot.command('models', async (ctx) => {
      const telegramId = BigInt(ctx.from!.id);
      const currentModel = this.userModels.get(telegramId) || 'gpt-4o-mini';
      await ctx.reply('Choose a model:', {
        reply_markup: this.buildModelKeyboard(currentModel),
      });
    });

    // /balance
    this.bot.command('balance', async (ctx) => {
      const user = await this.ensureUser(ctx);
      if (!user) return;
      const balance = await this.wallet.getBalance(user.id);
      await ctx.reply(`Your balance: $${balance.toFixed(6)}`);
    });

    // Login confirmation callback (inline button)
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
        await ctx.editMessageText('Web login confirmed.');
      } catch {
        await ctx.answerCallbackQuery({ text: 'Error confirming login' });
      }
    });

    // All text messages
    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message!.text;
      const telegramId = BigInt(ctx.from!.id);

      // "New Chat" button
      if (text === 'New Chat') {
        const user = await this.ensureUser(ctx);
        if (!user) return;
        const currentModel = this.userModels.get(telegramId) || 'gpt-4o-mini';
        const session = await this.chatService.createSession(user.id, currentModel);
        this.userSessions.set(telegramId, session.id);
        await ctx.reply(`New chat started. Model: ${currentModel}`, {
          reply_markup: this.buildMainKeyboard(),
        });
        return;
      }

      // "Choose Model" button
      if (text === 'Choose Model') {
        const currentModel = this.userModels.get(telegramId) || 'gpt-4o-mini';
        await ctx.reply('Choose a model:', {
          reply_markup: this.buildModelKeyboard(currentModel),
        });
        return;
      }

      // "Back" button — return to main keyboard
      if (text === '« Back') {
        await ctx.reply('OK', { reply_markup: this.buildMainKeyboard() });
        return;
      }

      // Model selection (from model keyboard)
      const cleanText = text.replace('✓ ', '');
      if (DEFAULT_ALLOWED_MODELS.includes(cleanText)) {
        const user = await this.ensureUser(ctx);
        if (!user) return;
        this.userModels.set(telegramId, cleanText);
        const session = await this.chatService.createSession(user.id, cleanText);
        this.userSessions.set(telegramId, session.id);
        await ctx.reply(`Model: ${cleanText}\nNew chat started.`, {
          reply_markup: this.buildMainKeyboard(),
        });
        return;
      }

      // Admin commands
      if (this.admin.isAdmin(telegramId)) {
        const adminResult = await this.handleAdminCommand(telegramId, text);
        if (adminResult) {
          await ctx.reply(adminResult);
          return;
        }
      }

      // Regular chat message — stream response
      await this.handleTextMessageStreaming(ctx);
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      await this.handleVoiceMessage(ctx);
    });

    this.bot.on('message:audio', async (ctx) => {
      await this.handleVoiceMessage(ctx);
    });
  }

  private async handleTextMessageStreaming(ctx: Context) {
    const user = await this.ensureUser(ctx);
    if (!user) return;

    const telegramId = BigInt(ctx.from!.id);
    const session = await this.getOrCreateSession(user, telegramId);
    const text = ctx.message!.text!;

    try {
      // Send initial placeholder message
      const sentMsg = await ctx.reply('...');
      const chatId = sentMsg.chat.id;
      const messageId = sentMsg.message_id;

      let fullText = '';
      let lastEditTime = 0;
      let pendingEdit = false;

      const doEdit = async (content: string) => {
        try {
          await this.bot.api.editMessageText(chatId, messageId, content);
        } catch (e: any) {
          // Ignore "message is not modified" errors
          if (!e.message?.includes('not modified')) {
            this.logger.error('Edit error:', e.message);
          }
        }
      };

      for await (const event of this.chatService.sendMessageStream(user.id, session.id, text)) {
        if (event.type === 'delta' && event.data.text) {
          fullText += event.data.text;

          const now = Date.now();
          if (now - lastEditTime >= EDIT_INTERVAL_MS) {
            lastEditTime = now;
            pendingEdit = false;
            await doEdit(fullText + ' ▍');
          } else {
            pendingEdit = true;
          }
        }

        if (event.type === 'done') {
          // Final edit with complete text
          if (fullText) {
            await doEdit(fullText);
          }
        }
      }

      // If there's a pending edit that didn't fire
      if (pendingEdit && fullText) {
        await doEdit(fullText);
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

    const sentMsg = await ctx.reply('Transcribing...');
    const chatId = sentMsg.chat.id;
    const messageId = sentMsg.message_id;

    try {
      const file = await ctx.getFile();
      const filePath = await this.downloadTelegramFile(file.file_path!);
      const result = await this.chatService.sendVoiceMessage(user.id, session.id, filePath);

      const response = `🎙 "${result.transcriptText}"\n\n${result.content}`;

      try {
        await this.bot.api.editMessageText(chatId, messageId, response);
      } catch {
        // If edit fails, send new message
        await ctx.reply(response);
      }
    } catch (error: any) {
      this.logger.error('Voice error:', error.message);
      try {
        await this.bot.api.editMessageText(chatId, messageId, `Error: ${error.message}`);
      } catch {
        await ctx.reply(`Error: ${error.message}`);
      }
    }
  }

  private async handleLoginConfirmation(ctx: Context, payload: string) {
    const challengeId = payload.replace('login_', '');
    const keyboard = new InlineKeyboard()
      .text('Confirm login', `confirm_login:${challengeId}`);
    await ctx.reply(
      'Someone is trying to log into the web app.\n\nIf this was you, tap confirm:',
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
      BigInt(from.id), from.username, from.first_name, from.last_name ?? undefined,
    );
    if (user.isBlocked) {
      await ctx.reply('Your account is blocked.');
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
    const model = this.userModels.get(telegramId) || 'gpt-4o-mini';
    const session = await this.chatService.createSession(user.id, model);
    this.userSessions.set(telegramId, session.id);
    return session;
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

  async sendLoginChallenge(telegramId: bigint, challengeId: string, code: string) {
    const keyboard = new InlineKeyboard()
      .text('Confirm login', `confirm_login:${challengeId}`);

    await this.bot.api.sendMessage(
      telegramId.toString(),
      `Web login code: ${code}\n\nIf this was you, tap confirm:`,
      { reply_markup: keyboard },
    );
  }
}
