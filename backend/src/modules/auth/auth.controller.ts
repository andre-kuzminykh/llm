import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { WalletService } from '../wallet/wallet.service';
import { TelegramService } from '../telegram/telegram.service';
import { UserService } from '../user/user.service';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private walletService: WalletService,
    private telegramService: TelegramService,
    private userService: UserService,
  ) {}

  @Post('request')
  async requestLogin(@Body() body: { telegramUsername: string }) {
    const { challengeId, code, telegramId } = await this.authService.requestLogin(body.telegramUsername);

    // Send the login code to user's Telegram
    await this.telegramService.sendLoginChallenge(telegramId, challengeId, code);

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
    const user = await this.userService.findById(userId);
    const balance = await this.walletService.getBalance(userId);
    return {
      userId,
      balance,
      telegramUsername: user?.telegramUsername,
      firstName: user?.firstName,
    };
  }
}
