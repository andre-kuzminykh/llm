import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { UserService } from '../user/user.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly adminTelegramIds: Set<bigint>;

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private userService: UserService,
    private configService: ConfigService,
  ) {
    const ids = this.configService.get('ADMIN_TELEGRAM_IDS', '');
    this.adminTelegramIds = new Set(
      ids.split(',').filter(Boolean).map((id: string) => BigInt(id.trim())),
    );
  }

  isAdmin(telegramId: bigint): boolean {
    return this.adminTelegramIds.has(telegramId);
  }

  private async audit(adminTelegramId: bigint, action: string, targetUserId?: string, details?: string) {
    await this.prisma.adminAuditLog.create({
      data: { adminTelegramId, action, targetUserId, details },
    });
  }

  async addCredit(adminTelegramId: bigint, username: string, amount: number): Promise<string> {
    if (!this.isAdmin(adminTelegramId)) throw new ForbiddenException();

    const user = await this.userService.findByTelegramUsername(username);
    if (!user) return `User @${username} not found`;

    const newBalance = await this.wallet.credit(
      user.id,
      amount,
      'admin_credit',
      `Admin credit by ${adminTelegramId}`,
    );

    await this.audit(adminTelegramId, 'add_credit', user.id, `+$${amount.toFixed(2)}`);
    return `Added $${amount.toFixed(2)} to @${username}. New balance: $${newBalance.toFixed(6)}`;
  }

  async removeCredit(adminTelegramId: bigint, username: string, amount: number): Promise<string> {
    if (!this.isAdmin(adminTelegramId)) throw new ForbiddenException();

    const user = await this.userService.findByTelegramUsername(username);
    if (!user) return `User @${username} not found`;

    try {
      const newBalance = await this.wallet.debit(
        user.id,
        amount,
        `Admin debit by ${adminTelegramId}`,
      );
      await this.audit(adminTelegramId, 'remove_credit', user.id, `-$${amount.toFixed(2)}`);
      return `Removed $${amount.toFixed(2)} from @${username}. New balance: $${newBalance.toFixed(6)}`;
    } catch {
      return `Insufficient balance for @${username}`;
    }
  }

  async getBalanceOf(adminTelegramId: bigint, username: string): Promise<string> {
    if (!this.isAdmin(adminTelegramId)) throw new ForbiddenException();

    const user = await this.userService.findByTelegramUsername(username);
    if (!user) return `User @${username} not found`;

    const balance = await this.wallet.getBalance(user.id);
    await this.audit(adminTelegramId, 'view_balance', user.id);
    return `@${username} balance: $${balance.toFixed(6)}${user.isBlocked ? ' [BLOCKED]' : ''}`;
  }

  async blockUser(adminTelegramId: bigint, username: string): Promise<string> {
    if (!this.isAdmin(adminTelegramId)) throw new ForbiddenException();

    const user = await this.userService.findByTelegramUsername(username);
    if (!user) return `User @${username} not found`;

    await this.userService.blockUser(user.id);
    await this.audit(adminTelegramId, 'block_user', user.id);
    return `User @${username} blocked`;
  }

  async unblockUser(adminTelegramId: bigint, username: string): Promise<string> {
    if (!this.isAdmin(adminTelegramId)) throw new ForbiddenException();

    const user = await this.userService.findByTelegramUsername(username);
    if (!user) return `User @${username} not found`;

    await this.userService.unblockUser(user.id);
    await this.audit(adminTelegramId, 'unblock_user', user.id);
    return `User @${username} unblocked`;
  }

  async getUserUsage(adminTelegramId: bigint, username: string, days: number = 30): Promise<string> {
    if (!this.isAdmin(adminTelegramId)) throw new ForbiddenException();

    const user = await this.userService.findByTelegramUsername(username);
    if (!user) return `User @${username} not found`;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const records = await this.prisma.usageRecord.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
    });

    const totalCost = records.reduce((sum, r) => sum + Number(r.costUsd), 0);
    const chatCount = records.filter(r => r.operationType === 'chat').length;
    const transcriptionCount = records.filter(r => r.operationType === 'transcription').length;

    await this.audit(adminTelegramId, 'view_usage', user.id, `${days}d`);

    return [
      `Usage for @${username} (last ${days}d):`,
      `Total cost: $${totalCost.toFixed(6)}`,
      `Chat requests: ${chatCount}`,
      `Transcriptions: ${transcriptionCount}`,
      `Current balance: $${Number(user.balanceUsd).toFixed(6)}`,
    ].join('\n');
  }
}
