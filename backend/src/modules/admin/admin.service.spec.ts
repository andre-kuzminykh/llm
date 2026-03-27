import { AdminService } from './admin.service';
import { ConfigService } from '@nestjs/config';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;
  let wallet: any;
  let userService: any;
  let configService: any;

  const adminTelegramId = BigInt(123456789);

  beforeEach(() => {
    prisma = {
      usageRecord: { findMany: jest.fn() },
      adminAuditLog: { create: jest.fn() },
    };

    wallet = {
      credit: jest.fn(),
      debit: jest.fn(),
      getBalance: jest.fn(),
    };

    userService = {
      findByTelegramUsername: jest.fn(),
      blockUser: jest.fn(),
      unblockUser: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue('123456789'),
    };

    service = new AdminService(prisma, wallet, userService, configService);
  });

  describe('isAdmin', () => {
    it('should return true for admin telegram id', () => {
      expect(service.isAdmin(adminTelegramId)).toBe(true);
    });

    it('should return false for non-admin telegram id', () => {
      expect(service.isAdmin(BigInt(999999))).toBe(false);
    });
  });

  describe('addCredit', () => {
    it('should add credit and return success message', async () => {
      userService.findByTelegramUsername.mockResolvedValue({
        id: 'user-1',
        telegramUsername: 'testuser',
      });
      wallet.credit.mockResolvedValue(15.0);

      const result = await service.addCredit(adminTelegramId, 'testuser', 10);
      expect(result).toContain('Added $10.00');
      expect(result).toContain('testuser');
      expect(wallet.credit).toHaveBeenCalledWith('user-1', 10, 'admin_credit', expect.any(String));
      expect(prisma.adminAuditLog.create).toHaveBeenCalled();
    });

    it('should return error for non-existent user', async () => {
      userService.findByTelegramUsername.mockResolvedValue(null);

      const result = await service.addCredit(adminTelegramId, 'nobody', 10);
      expect(result).toContain('not found');
    });
  });

  describe('blockUser', () => {
    it('should block user and return confirmation', async () => {
      userService.findByTelegramUsername.mockResolvedValue({ id: 'user-1' });
      userService.blockUser.mockResolvedValue({});

      const result = await service.blockUser(adminTelegramId, 'testuser');
      expect(result).toContain('blocked');
      expect(userService.blockUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getUserUsage', () => {
    it('should return usage summary', async () => {
      userService.findByTelegramUsername.mockResolvedValue({
        id: 'user-1',
        balanceUsd: 5.0,
      });
      prisma.usageRecord.findMany.mockResolvedValue([
        { operationType: 'chat', costUsd: 0.01 },
        { operationType: 'chat', costUsd: 0.02 },
        { operationType: 'transcription', costUsd: 0.003 },
      ]);

      const result = await service.getUserUsage(adminTelegramId, 'testuser', 7);
      expect(result).toContain('Chat requests: 2');
      expect(result).toContain('Transcriptions: 1');
      expect(result).toContain('last 7d');
    });
  });
});
