import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

describe('Forgot Password & Password Reset Security Flow', () => {
  let authService: AuthService;
  let prismaMock: any;
  let emailServiceMock: any;
  let jwtServiceMock: any;
  let cacheHelperMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      passwordResetToken: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      userSession: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb({
            $executeRaw: vi.fn().mockResolvedValue(1),
            passwordResetToken: {
              findUnique: prismaMock.passwordResetToken.findUnique,
              update: prismaMock.passwordResetToken.update,
              updateMany: prismaMock.passwordResetToken.updateMany,
            },
            user: {
              update: prismaMock.user.update,
            },
            userSession: {
              updateMany: prismaMock.userSession.updateMany,
            },
          });
        }
        return Promise.all(cb);
      }),
    };

    emailServiceMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue({ id: 'mock-mail-id' }),
    };

    jwtServiceMock = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    cacheHelperMock = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(undefined),
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      prismaMock as any,
      jwtServiceMock as any,
      cacheHelperMock as any,
      emailServiceMock as any,
    );
  });

  const genericResponse = {
    message: 'If an account with that email exists, a password reset link has been sent.',
  };

  describe('Scenario: Multi-User Isolation & Target Address Integrity', () => {
    const userA = {
      id: 'user-a-uuid',
      email: 'a@email.com',
      name: 'Alice User',
      passwordHash: '$2a$12$OldHashForUserA11111111111111111111111111111111111111111',
      deletedAt: null,
    };

    const userB = {
      id: 'user-b-uuid',
      email: 'b@email.com',
      name: 'Bob User',
      passwordHash: '$2a$12$OldHashForUserB22222222222222222222222222222222222222222',
      deletedAt: null,
    };

    it('when reset is requested for b@email.com, email is sent strictly to b@email.com and user A is never affected', async () => {
      // User B exists in DB
      prismaMock.user.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.email === 'b@email.com') return userB;
        if (where.email === 'a@email.com') return userA;
        return null;
      });
      prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'token-b-db-id' });

      // Action: Reset requested with email 'b@email.com'
      const res = await authService.requestPasswordReset('b@email.com');

      // 1. Must return generic enumeration-safe response
      expect(res).toEqual(genericResponse);

      // 2. Token created foreign-keyed strictly to User B, NOT User A
      expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const tokenCreateCall = prismaMock.passwordResetToken.create.mock.calls[0][0];
      expect(tokenCreateCall.data.userId).toBe(userB.id);
      expect(tokenCreateCall.data.userId).not.toBe(userA.id);

      // 3. Email sent strictly to User B's registered email address
      expect(emailServiceMock.sendTemplateEmail).toHaveBeenCalledTimes(1);
      const emailCall = emailServiceMock.sendTemplateEmail.mock.calls[0][0];
      expect(emailCall.to).toBe('b@email.com');
      expect(emailCall.to).not.toBe('a@email.com');

      // 4. Passwords in DB remain completely untouched
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('requesting reset using a@email.com sends link to User A and resets only User A password', async () => {
      prismaMock.user.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.email === 'a@email.com') return userA;
        if (where.id === userA.id) return userA;
        return null;
      });

      let capturedRawToken = '';
      prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'token-a-db-id' });

      emailServiceMock.sendTemplateEmail.mockImplementation(async (opts: any) => {
        const match = opts.props.resetUrl.match(/token=([a-f0-9]+)/);
        if (match) capturedRawToken = match[1];
        return { id: 'email-id' };
      });

      // Step 1: User A requests reset
      await authService.requestPasswordReset('a@email.com');

      expect(emailServiceMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@email.com',
          template: 'PasswordResetEmail',
        }),
      );
      expect(capturedRawToken).toBeTruthy();
      expect(capturedRawToken.length).toBe(64); // 256-bit hex

      const expectedHash = createHash('sha256').update(capturedRawToken).digest('hex');

      // Step 2: Confirm password reset with the delivered token
      const mockResetTokenRecord = {
        id: 'token-a-db-id',
        userId: userA.id,
        token: expectedHash,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour future
        usedAt: null,
        user: userA,
      };

      prismaMock.passwordResetToken.findUnique.mockResolvedValue(mockResetTokenRecord);
      prismaMock.user.update.mockResolvedValue({});
      prismaMock.passwordResetToken.update.mockResolvedValue({});
      prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.userSession.updateMany.mockResolvedValue({ count: 2 });

      const confirmRes = await authService.confirmPasswordReset(
        capturedRawToken,
        'BrandNewSecurePasswordForA123!',
      );

      expect(confirmRes).toEqual({
        success: true,
        message: 'Password has been reset successfully',
      });

      // 3. User A's password updated, User B is NOT updated
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userA.id },
        }),
      );
      expect(prismaMock.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userB.id },
        }),
      );

      // 4. Token A marked as used
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-a-db-id' },
          data: { usedAt: expect.any(Date) },
        }),
      );

      // 5. Active sessions for User A revoked, User B sessions untouched
      expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: userA.id, revokedAt: null },
          data: expect.objectContaining({ revokedReason: 'PASSWORD_RESET' }),
        }),
      );
    });
  });

  describe('Security Edge Cases: Token Hygiene & Enumeration Prevention', () => {
    it('unregistered email returns identical generic response without creating tokens or sending emails', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await authService.requestPasswordReset('unregistered@notfound.com');

      expect(res).toEqual(genericResponse);
      expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailServiceMock.sendTemplateEmail).not.toHaveBeenCalled();
    });

    it('email with mixed casing and whitespace is normalized properly', async () => {
      const user = {
        id: 'u-norm',
        email: 'normalized@example.com',
        deletedAt: null,
      };
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

      await authService.requestPasswordReset('   Normalized@EXAMPLE.COM   ');

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'normalized@example.com' },
      });
      expect(emailServiceMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'normalized@example.com',
        }),
      );
    });

    it('raw token is never persisted in database, only SHA-256 hash', async () => {
      const user = { id: 'u-hash-test', email: 'test@example.com', deletedAt: null };
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'prt-hash' });

      let deliveredRawToken = '';
      emailServiceMock.sendTemplateEmail.mockImplementation(async (opts: any) => {
        const match = opts.props.resetUrl.match(/token=([a-f0-9]+)/);
        if (match) deliveredRawToken = match[1];
        return { id: 'e-1' };
      });

      await authService.requestPasswordReset('test@example.com');

      const savedTokenHash = prismaMock.passwordResetToken.create.mock.calls[0][0].data.token;

      // The saved DB token MUST be the hash of delivered raw token
      expect(savedTokenHash).not.toBe(deliveredRawToken);
      const computedHash = createHash('sha256').update(deliveredRawToken).digest('hex');
      expect(savedTokenHash).toBe(computedHash);
    });

    it('rejects expired token', async () => {
      const expiredToken = {
        id: 'prt-expired',
        userId: 'user-1',
        token: createHash('sha256').update('expired-token').digest('hex'),
        expiresAt: new Date(Date.now() - 5000), // 5 seconds ago
        usedAt: null,
        user: { id: 'user-1', deletedAt: null },
      };
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(expiredToken);

      await expect(
        authService.confirmPasswordReset('expired-token', 'NewSecurePassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects already used token (preventing replay attacks)', async () => {
      const usedToken = {
        id: 'prt-used',
        userId: 'user-1',
        token: createHash('sha256').update('reused-token').digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(Date.now() - 10000), // already used
        user: { id: 'user-1', deletedAt: null },
      };
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(usedToken);

      await expect(
        authService.confirmPasswordReset('reused-token', 'NewSecurePassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid or unknown token', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        authService.confirmPasswordReset('unknown-random-token', 'NewSecurePassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty or whitespace-only token', async () => {
      await expect(
        authService.confirmPasswordReset('   ', 'NewSecurePassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects new password shorter than 8 characters', async () => {
      await expect(
        authService.confirmPasswordReset('valid-token', 'short'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
