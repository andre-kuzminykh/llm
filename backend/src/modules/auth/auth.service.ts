import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.getOrThrow('JWT_SECRET');
    this.jwtExpiresIn = this.configService.get('JWT_EXPIRES_IN', '7d');
  }

  async requestLogin(telegramUsername: string): Promise<{ challengeId: string; code: string }> {
    const user = await this.userService.findByTelegramUsername(telegramUsername);
    if (!user) {
      throw new BadRequestException('User not found. Please start the Telegram bot first.');
    }

    if (user.isBlocked) {
      throw new BadRequestException('Account is blocked');
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();

    const challenge = await this.prisma.authChallenge.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    return { challengeId: challenge.id, code };
  }

  async confirmLogin(challengeId: string, code: string): Promise<{ token: string; user: any }> {
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });

    if (!challenge) throw new UnauthorizedException('Invalid challenge');
    if (challenge.confirmed) throw new UnauthorizedException('Challenge already used');
    if (challenge.expiresAt < new Date()) throw new UnauthorizedException('Challenge expired');
    if (challenge.code !== code) throw new UnauthorizedException('Invalid code');

    await this.prisma.authChallenge.update({
      where: { id: challengeId },
      data: { confirmed: true, usedAt: new Date() },
    });

    const token = jwt.sign(
      { userId: challenge.userId, telegramId: challenge.user.telegramId.toString() },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn } as jwt.SignOptions,
    );

    return {
      token,
      user: {
        id: challenge.user.id,
        telegramUsername: challenge.user.telegramUsername,
        firstName: challenge.user.firstName,
        balanceUsd: Number(challenge.user.balanceUsd),
      },
    };
  }

  verifyToken(token: string): { userId: string; telegramId: string } {
    try {
      return jwt.verify(token, this.jwtSecret) as { userId: string; telegramId: string };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
