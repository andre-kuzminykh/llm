import { Controller, Post, Req, Res, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import { TelegramService } from './telegram.service';
import { ConfigService } from '@nestjs/config';

@Controller('telegram')
export class TelegramController {
  constructor(
    private telegramService: TelegramService,
    private configService: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const secret = this.configService.get('TELEGRAM_WEBHOOK_SECRET', '');
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];

    if (secret && headerSecret !== secret) {
      res.status(403).send('Forbidden');
      return;
    }

    try {
      await this.telegramService.bot.handleUpdate(req.body);
    } catch (error) {
      console.error('Webhook error:', error);
    }

    res.send('OK');
  }
}
