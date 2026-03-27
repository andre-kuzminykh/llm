import { AuthService } from './auth.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let userService: any;
  let configService: any;

  const jwtSecret = 'test-secret';

  beforeEach(() => {
    prisma = {
      authChallenge: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    userService = {
      findByTelegramUsername: jest.fn(),
    };

    configService = {
      getOrThrow: jest.fn().mockReturnValue(jwtSecret),
      get: jest.fn().mockReturnValue('7d'),
    };

    service = new AuthService(prisma, userService, configService);
  });

  describe('requestLogin', () => {
    it('should create auth challenge for existing user', async () => {
      userService.findByTelegramUsername.mockResolvedValue({
        id: 'user-1',
        telegramId: BigInt(123),
        isBlocked: false,
      });
      prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1', code: '123456' });

      const result = await service.requestLogin('testuser');
      expect(result.challengeId).toBe('challenge-1');
      expect(result.telegramId).toBe(BigInt(123));
      expect(result.code).toBeDefined();
      expect(result.code.length).toBe(6);
    });

    it('should throw for non-existent user', async () => {
      userService.findByTelegramUsername.mockResolvedValue(null);

      await expect(service.requestLogin('nobody'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for blocked user', async () => {
      userService.findByTelegramUsername.mockResolvedValue({
        id: 'user-1',
        isBlocked: true,
      });

      await expect(service.requestLogin('blocked'))
        .rejects.toThrow('Account is blocked');
    });
  });

  describe('confirmLogin', () => {
    it('should return JWT token on valid confirmation', async () => {
      prisma.authChallenge.findUnique.mockResolvedValue({
        id: 'challenge-1',
        code: '123456',
        confirmed: false,
        expiresAt: new Date(Date.now() + 300000),
        userId: 'user-1',
        user: {
          id: 'user-1',
          telegramId: BigInt(123),
          telegramUsername: 'testuser',
          firstName: 'Test',
          balanceUsd: 10,
        },
      });
      prisma.authChallenge.update.mockResolvedValue({});

      const result = await service.confirmLogin('challenge-1', '123456');
      expect(result.token).toBeDefined();
      expect(result.user.telegramUsername).toBe('testuser');

      // Verify JWT is valid
      const decoded = jwt.verify(result.token, jwtSecret) as any;
      expect(decoded.userId).toBe('user-1');
    });

    it('should throw for wrong code', async () => {
      prisma.authChallenge.findUnique.mockResolvedValue({
        id: 'challenge-1',
        code: '123456',
        confirmed: false,
        expiresAt: new Date(Date.now() + 300000),
      });

      await expect(service.confirmLogin('challenge-1', '000000'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw for expired challenge', async () => {
      prisma.authChallenge.findUnique.mockResolvedValue({
        id: 'challenge-1',
        code: '123456',
        confirmed: false,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      await expect(service.confirmLogin('challenge-1', '123456'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw for already used challenge', async () => {
      prisma.authChallenge.findUnique.mockResolvedValue({
        id: 'challenge-1',
        code: '123456',
        confirmed: true,
        expiresAt: new Date(Date.now() + 300000),
      });

      await expect(service.confirmLogin('challenge-1', '123456'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyToken', () => {
    it('should return payload for valid token', () => {
      const token = jwt.sign(
        { userId: 'user-1', telegramId: '123' },
        jwtSecret,
        { expiresIn: '1h' } as jwt.SignOptions,
      );
      const result = service.verifyToken(token);
      expect(result.userId).toBe('user-1');
    });

    it('should throw for invalid token', () => {
      expect(() => service.verifyToken('bad-token'))
        .toThrow(UnauthorizedException);
    });
  });
});
