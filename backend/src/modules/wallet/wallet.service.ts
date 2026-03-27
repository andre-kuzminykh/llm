import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import {
  getChatModelPrice,
  getTranscriptionPrice,
} from '../../config/prices';

export interface CostCalculation {
  costUsd: number;
  breakdown: string;
}

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { balanceUsd: true },
    });
    return Number(user.balanceUsd);
  }

  async checkBalance(userId: string, estimatedCost: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= estimatedCost;
  }

  calculateChatCost(model: string, inputTokens: number, outputTokens: number): CostCalculation {
    const pricing = getChatModelPrice(model);
    if (!pricing) {
      throw new BadRequestException(`No pricing found for model: ${model}`);
    }
    const inputCost = inputTokens * pricing.inputPricePerToken;
    const outputCost = outputTokens * pricing.outputPricePerToken;
    const costUsd = inputCost + outputCost;
    return {
      costUsd,
      breakdown: `${inputTokens} input tokens ($${inputCost.toFixed(8)}) + ${outputTokens} output tokens ($${outputCost.toFixed(8)})`,
    };
  }

  calculateTranscriptionCost(model: string, durationSeconds: number): CostCalculation {
    const pricing = getTranscriptionPrice(model);
    if (!pricing) {
      throw new BadRequestException(`No pricing found for transcription model: ${model}`);
    }
    const durationMinutes = durationSeconds / 60;
    const costUsd = durationMinutes * pricing.pricePerMinute;
    return {
      costUsd,
      breakdown: `${durationSeconds.toFixed(1)}s audio ($${costUsd.toFixed(8)})`,
    };
  }

  async debit(
    userId: string,
    amountUsd: number,
    description: string,
    referenceId?: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
      });

      const currentBalance = Number(user.balanceUsd);
      if (currentBalance < amountUsd) {
        throw new BadRequestException('Insufficient balance');
      }

      const newBalance = currentBalance - amountUsd;

      await tx.user.update({
        where: { id: userId },
        data: { balanceUsd: new Decimal(newBalance.toFixed(6)) },
      });

      await tx.walletLedgerEntry.create({
        data: {
          userId,
          amountUsd: new Decimal((-amountUsd).toFixed(6)),
          type: 'debit',
          description,
          balanceAfter: new Decimal(newBalance.toFixed(6)),
          referenceId,
        },
      });

      return newBalance;
    });
  }

  async credit(
    userId: string,
    amountUsd: number,
    type: 'credit' | 'admin_credit',
    description: string,
    referenceId?: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
      });

      const currentBalance = Number(user.balanceUsd);
      const newBalance = currentBalance + amountUsd;

      await tx.user.update({
        where: { id: userId },
        data: { balanceUsd: new Decimal(newBalance.toFixed(6)) },
      });

      await tx.walletLedgerEntry.create({
        data: {
          userId,
          amountUsd: new Decimal(amountUsd.toFixed(6)),
          type,
          description,
          balanceAfter: new Decimal(newBalance.toFixed(6)),
          referenceId,
        },
      });

      return newBalance;
    });
  }
}
