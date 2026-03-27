import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      walletLedgerEntry: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    service = new WalletService(prisma as any);
  });

  describe('getBalance', () => {
    it('should return user balance as number', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ balanceUsd: new Decimal('10.500000') });
      const balance = await service.getBalance('user-1');
      expect(balance).toBe(10.5);
    });
  });

  describe('checkBalance', () => {
    it('should return true if balance >= cost', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ balanceUsd: new Decimal('5.000000') });
      expect(await service.checkBalance('user-1', 3)).toBe(true);
    });

    it('should return false if balance < cost', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ balanceUsd: new Decimal('1.000000') });
      expect(await service.checkBalance('user-1', 3)).toBe(false);
    });
  });

  describe('calculateChatCost', () => {
    it('should calculate cost for gpt-4o-mini', () => {
      const result = service.calculateChatCost('gpt-4o-mini', 1000, 500);
      // input: 1000 * 0.00000015 = 0.00015
      // output: 500 * 0.0000006 = 0.0003
      // total: 0.00045
      expect(result.costUsd).toBeCloseTo(0.00045, 8);
      expect(result.breakdown).toContain('1000 input tokens');
      expect(result.breakdown).toContain('500 output tokens');
    });

    it('should calculate cost for gpt-4o', () => {
      const result = service.calculateChatCost('gpt-4o', 1000, 500);
      // input: 1000 * 0.0000025 = 0.0025
      // output: 500 * 0.00001 = 0.005
      expect(result.costUsd).toBeCloseTo(0.0075, 8);
    });

    it('should throw for unknown model', () => {
      expect(() => service.calculateChatCost('unknown-model', 100, 100))
        .toThrow(BadRequestException);
    });
  });

  describe('calculateTranscriptionCost', () => {
    it('should calculate cost for gpt-4o-mini-transcribe', () => {
      const result = service.calculateTranscriptionCost('gpt-4o-mini-transcribe', 60);
      // 60s = 1 min, $0.003/min
      expect(result.costUsd).toBeCloseTo(0.003, 8);
    });

    it('should calculate cost for 30 seconds', () => {
      const result = service.calculateTranscriptionCost('gpt-4o-mini-transcribe', 30);
      // 30s = 0.5 min, $0.003/min = $0.0015
      expect(result.costUsd).toBeCloseTo(0.0015, 8);
    });

    it('should throw for unknown transcription model', () => {
      expect(() => service.calculateTranscriptionCost('unknown', 60))
        .toThrow(BadRequestException);
    });
  });

  describe('debit', () => {
    it('should debit amount and create ledger entry', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        balanceUsd: new Decimal('10.000000'),
      });
      prisma.user.update.mockResolvedValue({});
      prisma.walletLedgerEntry.create.mockResolvedValue({});

      const newBalance = await service.debit('user-1', 2.5, 'test debit');
      expect(newBalance).toBe(7.5);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
        }),
      );
      expect(prisma.walletLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            type: 'debit',
          }),
        }),
      );
    });

    it('should throw if insufficient balance', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        balanceUsd: new Decimal('1.000000'),
      });

      await expect(service.debit('user-1', 5, 'test'))
        .rejects.toThrow('Insufficient balance');
    });
  });

  describe('credit', () => {
    it('should credit amount and create ledger entry', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        balanceUsd: new Decimal('5.000000'),
      });
      prisma.user.update.mockResolvedValue({});
      prisma.walletLedgerEntry.create.mockResolvedValue({});

      const newBalance = await service.credit('user-1', 10, 'admin_credit', 'test credit');
      expect(newBalance).toBe(15);
    });
  });
});
