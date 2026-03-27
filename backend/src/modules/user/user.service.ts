import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findByTelegramId(telegramId: bigint) {
    return this.prisma.user.findUnique({
      where: { telegramId },
    });
  }

  async findByTelegramUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { telegramUsername: username.replace('@', '').toLowerCase() },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findOrCreateByTelegram(
    telegramId: bigint,
    username?: string,
    firstName?: string,
    lastName?: string,
  ) {
    const normalizedUsername = username?.toLowerCase();

    return this.prisma.user.upsert({
      where: { telegramId },
      update: {
        telegramUsername: normalizedUsername,
        firstName,
        lastName,
      },
      create: {
        telegramId,
        telegramUsername: normalizedUsername,
        firstName,
        lastName,
        balanceUsd: 0,
      },
    });
  }

  async blockUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked: true },
    });
  }

  async unblockUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked: false },
    });
  }
}
