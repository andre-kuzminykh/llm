import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { WalletService } from '../wallet/wallet.service';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private walletService: WalletService,
  ) {}

  @Post('request')
  async requestLogin(@Body() body: { telegramUsername: string }) {
    const { challengeId, code } = await this.authService.requestLogin(body.telegramUsername);
    // The code will be sent to user's Telegram by the bot
    // We return the challengeId so the web app can poll for confirmation
    return { challengeId, message: 'Check your Telegram for a login code' };
  }

  @Post('confirm')
  async confirmLogin(@Body() body: { challengeId: string; code: string }) {
    return this.authService.confirmLogin(body.challengeId, body.code);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Req() req: Request) {
    const userId = (req as any).userId;
    const balance = await this.walletService.getBalance(userId);
    return { userId, balance };
  }
}
