import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, EnrolmentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SignupDto } from './dto/index.js';
import { rememberLiveSession, sessionKnownLive } from '../../common/session-cache.js';
import { JwtStrategy } from './jwt.strategy.js';
import {
  generateTotp,
  generateTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  hashBackupCode,
  generateBackupCodes,
} from './totp.util.js';

describe('AuthService - Authentication Tests', () => {
  let authService: AuthService;
  let prismaMock: any;
  let jwtServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      emailVerificationToken: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      program: {
        findUnique: vi.fn(),
      },
      batch: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      enrolment: {
        create: vi.fn(),
      },
      dailyAttendance: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userSession: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      logAction: vi.fn().mockResolvedValue({}),
      $transaction: vi.fn().mockImplementation(async (fns) => {
        if (typeof fns === 'function') return fns(prismaMock);
        if (Array.isArray(fns)) return Promise.all(fns);
        return fns;
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    jwtServiceMock = {
      sign: vi.fn().mockImplementation((payload) => `mock-token-for-${payload.sub}`),
      verify: vi.fn(),
    };

    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtServiceMock as unknown as JwtService,
    );
  });

  describe('1. Scope Boundary Enforcement (No JWT / No Device Sessions in D1-014)', () => {
    it('does NOT issue access_token or refresh_token in signup response', async () => {
      const signupDto: SignupDto = {
        name: 'No Token User',
        email: 'notoken@example.com',
        password: 'SecurePassword123!',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-no-token',
        email: 'notoken@example.com',
        name: 'No Token User',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-1' });

      const response = await authService.signup(signupDto);

      // Verify JWT service was NEVER called
      expect(jwtServiceMock.sign).not.toHaveBeenCalled();

      // Verify response does not have token fields
      expect(response).not.toHaveProperty('access_token');
      expect(response).not.toHaveProperty('refresh_token');
      expect((response as any).access_token).toBeUndefined();
      expect((response as any).refresh_token).toBeUndefined();
    });

    it('does NOT create a UserSession or invoke device-limit/advisory-lock machinery', async () => {
      const signupDto: SignupDto = {
        name: 'No Session User',
        email: 'nosession@example.com',
        password: 'SecurePassword123!',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-no-session',
        email: 'nosession@example.com',
        name: 'No Session User',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-2' });

      await authService.signup(signupDto);

      // Verify UserSession creation and transaction lock were NOT invoked by signup
      expect(prismaMock.userSession.create).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('2. Canonical User Creation and Persistence', () => {
    it('creates canonical user with normalized email, trimmed name, country, timezone, phone and hashed password', async () => {
      const signupDto: SignupDto = {
        name: '  Jane Doe  ',
        email: '  JANE.DOE@Example.COM  ',
        password: 'SecurePassword123!',
        country: '  AU  ',
        timezone: '  Australia/Sydney  ',
        phone: '+61 400 123 456',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(null);

      const createdUser = {
        id: 'user-uuid-1',
        email: 'jane.doe@example.com',
        name: 'Jane Doe',
        phone: '+61400123456',
        country: 'AU',
        timezone: 'Australia/Sydney',
        role: Role.USER,
        companyId: null,
        emailVerifiedAt: null,
        passwordHash: '$2b$12$mockedHashedPasswordString',
      };
      prismaMock.user.create.mockResolvedValue(createdUser);
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-1' });

      const result = await authService.signup(signupDto);

      // Verify email check was normalized to lowercase and trimmed
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'jane.doe@example.com' },
      });

      // Verify phone check normalized phone number
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { phone: '+61400123456', deletedAt: null },
      });

      // Verify user.create arguments
      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
      const createArgs = prismaMock.user.create.mock.calls[0][0].data;
      expect(createArgs.email).toBe('jane.doe@example.com');
      expect(createArgs.name).toBe('Jane Doe');
      expect(createArgs.phone).toBe('+61400123456');
      expect(createArgs.country).toBe('AU');
      expect(createArgs.timezone).toBe('Australia/Sydney');
      expect(createArgs.role).toBe(Role.USER);
      expect(createArgs.emailVerifiedAt).toBeNull();

      // Verify password was hashed and NEVER stored in plaintext
      expect(createArgs.passwordHash).not.toBe('SecurePassword123!');
      expect(typeof createArgs.passwordHash).toBe('string');
      const isMatch = await bcrypt.compare('SecurePassword123!', createArgs.passwordHash);
      expect(isMatch).toBe(true);

      // Verify response structure returns safe user
      expect(result).toEqual({
        user: {
          id: 'user-uuid-1',
          email: 'jane.doe@example.com',
          name: 'Jane Doe',
          phone: '+61400123456',
          role: Role.USER,
          country: 'AU',
          timezone: 'Australia/Sydney',
          enrolledPrograms: [],
        },
      });
    });

    it('persists null for optional fields when phone, country, and timezone are omitted', async () => {
      const signupDto: SignupDto = {
        name: 'Minimal User',
        email: 'minimal@example.com',
        password: 'Password123!',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-uuid-2',
        email: 'minimal@example.com',
        name: 'Minimal User',
        phone: null,
        country: null,
        timezone: null,
        role: Role.USER,
        companyId: null,
        emailVerifiedAt: null,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-2' });

      await authService.signup(signupDto);

      // Phone lookup should not be called when phone is not provided
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();

      const createArgs = prismaMock.user.create.mock.calls[0][0].data;
      expect(createArgs.phone).toBeNull();
      expect(createArgs.country).toBeNull();
      expect(createArgs.timezone).toBeNull();
    });
  });

  describe('3. Email verification token boundary (D1-015 readiness)', () => {
    it('creates an EmailVerificationToken with 24-hour expiration for the created user', async () => {
      const signupDto: SignupDto = {
        name: 'Token Test',
        email: 'token@example.com',
        password: 'Password123!',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-uuid-token',
        email: 'token@example.com',
        name: 'Token Test',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-token' });

      const beforeCall = Date.now();
      await authService.signup(signupDto);
      const afterCall = Date.now();

      expect(prismaMock.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      const tokenArgs = prismaMock.emailVerificationToken.create.mock.calls[0][0].data;
      expect(tokenArgs.userId).toBe('user-uuid-token');
      expect(typeof tokenArgs.token).toBe('string');
      expect(tokenArgs.token.length).toBeGreaterThan(10);

      // Token expires in ~24 hours
      const expectedExpiryMin = beforeCall + 24 * 60 * 60 * 1000 - 1000;
      const expectedExpiryMax = afterCall + 24 * 60 * 60 * 1000 + 1000;
      const actualExpiry = tokenArgs.expiresAt.getTime();
      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiryMin);
      expect(actualExpiry).toBeLessThanOrEqual(expectedExpiryMax);
    });
  });

  describe('4. Duplicate rejection & security error handling', () => {
    it('rejects signup with ConflictException when email is already registered', async () => {
      const signupDto: SignupDto = {
        name: 'Duplicate Email',
        email: 'existing@example.com',
        password: 'Password123!',
      };

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-id',
        email: 'existing@example.com',
      });

      await expect(authService.signup(signupDto)).rejects.toThrow(ConflictException);
      await expect(authService.signup(signupDto)).rejects.toThrow(
        'An account with this email already exists',
      );
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('rejects signup with ConflictException when concurrent collision triggers P2002 on user.create', async () => {
      const signupDto: SignupDto = {
        name: 'Race Condition',
        email: 'race@example.com',
        password: 'Password123!',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      const prismaError: any = new Error('Unique constraint failed');
      prismaError.code = 'P2002';
      prismaMock.user.create.mockRejectedValue(prismaError);

      await expect(authService.signup(signupDto)).rejects.toThrow(ConflictException);
      await expect(authService.signup(signupDto)).rejects.toThrow(
        'An account with this email already exists',
      );
    });

    it('rejects signup with ConflictException when phone is already registered', async () => {
      const signupDto: SignupDto = {
        name: 'Duplicate Phone',
        email: 'unique@example.com',
        password: 'Password123!',
        phone: '+1 555 123 4567',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue({
        id: 'existing-phone-user',
        phone: '+15551234567',
      });

      await expect(authService.signup(signupDto)).rejects.toThrow(ConflictException);
      await expect(authService.signup(signupDto)).rejects.toThrow(
        'An account with this mobile number already exists',
      );
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe('5. Sensitive data exposure prevention', () => {
    it('never exposes password, passwordHash, twoFactorSecret, or verification tokens in return payload', async () => {
      const signupDto: SignupDto = {
        name: 'Safe User',
        email: 'safe@example.com',
        password: 'SuperSecretPassword123!',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-safe',
        email: 'safe@example.com',
        name: 'Safe User',
        phone: null,
        country: null,
        timezone: null,
        role: Role.USER,
        companyId: null,
        passwordHash: '$2b$12$secretHashValue',
        twoFactorSecret: 'SUPER_SECRET_2FA',
        emailVerifiedAt: null,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-safe' });

      const response = await authService.signup(signupDto);

      // Verify root response
      expect(response).not.toHaveProperty('password');
      expect(response).not.toHaveProperty('passwordHash');
      expect(response).not.toHaveProperty('twoFactorSecret');
      expect(response).not.toHaveProperty('token');

      // Verify user payload
      expect(response.user).not.toHaveProperty('password');
      expect(response.user).not.toHaveProperty('passwordHash');
      expect(response.user).not.toHaveProperty('twoFactorSecret');
      expect(response.user).not.toHaveProperty('twoFactorBackupCodes');
    });
  });

  describe('6. programIds behavior & payment/agreement gating', () => {
    it('sets PENDING_PAYMENT for paid programs and does not grant ACTIVE access', async () => {
      const signupDto: SignupDto = {
        name: 'Learner Paid',
        email: 'paid@example.com',
        password: 'Password123!',
        programIds: ['paid-prog-1'],
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-paid-1',
        email: 'paid@example.com',
        name: 'Learner Paid',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-paid' });

      // Mock paid program
      prismaMock.program.findUnique.mockResolvedValue({
        id: 'paid-prog-1',
        title: 'Full Stack Masterclass',
        price: 499,
      });

      // Mock existing batch for program
      prismaMock.batch.findFirst.mockResolvedValue({
        id: 'batch-1',
        name: 'Batch 2026',
        programId: 'paid-prog-1',
      });

      prismaMock.enrolment.create.mockResolvedValue({
        id: 'enrol-1',
        userId: 'user-paid-1',
        batchId: 'batch-1',
        programId: 'paid-prog-1',
        status: EnrolmentStatus.PENDING_PAYMENT,
        batch: {
          id: 'batch-1',
          name: 'Batch 2026',
          program: { title: 'Full Stack Masterclass' },
        },
      });

      const response = await authService.signup(signupDto);

      expect(prismaMock.enrolment.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-paid-1',
          batchId: 'batch-1',
          programId: 'paid-prog-1',
          status: EnrolmentStatus.PENDING_PAYMENT,
        },
        include: {
          batch: {
            include: { program: true },
          },
        },
      });

      expect(response.user.enrolledPrograms).toHaveLength(1);
      expect(response.user.enrolledPrograms[0].status).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(response.user.enrolledPrograms[0].status).not.toBe(EnrolmentStatus.ACTIVE);
    });

    it('sets PENDING_AGREEMENT for free programs (price <= 0)', async () => {
      const signupDto: SignupDto = {
        name: 'Learner Free',
        email: 'free@example.com',
        password: 'Password123!',
        programIds: ['free-prog-1'],
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-free-1',
        email: 'free@example.com',
        name: 'Learner Free',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-free' });

      // Mock free program
      prismaMock.program.findUnique.mockResolvedValue({
        id: 'free-prog-1',
        title: 'Intro to Coding',
        price: 0,
      });

      prismaMock.batch.findFirst.mockResolvedValue({
        id: 'batch-free',
        name: 'Existing Free Cohort',
        programId: 'free-prog-1',
      });

      prismaMock.enrolment.create.mockResolvedValue({
        id: 'enrol-free',
        userId: 'user-free-1',
        batchId: 'batch-free',
        programId: 'free-prog-1',
        status: EnrolmentStatus.PENDING_AGREEMENT,
        batch: {
          id: 'batch-free',
          name: 'Existing Free Cohort',
          program: { title: 'Intro to Coding' },
        },
      });

      const response = await authService.signup(signupDto);

      expect(prismaMock.enrolment.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-free-1',
          batchId: 'batch-free',
          programId: 'free-prog-1',
          status: EnrolmentStatus.PENDING_AGREEMENT,
        },
        include: {
          batch: {
            include: { program: true },
          },
        },
      });

      expect(response.user.enrolledPrograms[0].status).toBe(EnrolmentStatus.PENDING_AGREEMENT);
    });

    it('deduplicates duplicate programIds in signup payload', async () => {
      const signupDto: SignupDto = {
        name: 'Dup Prog',
        email: 'dupprog@example.com',
        password: 'Password123!',
        programIds: ['prog-dup', 'prog-dup'],
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-dup-prog',
        email: 'dupprog@example.com',
        name: 'Dup Prog',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-dup' });

      prismaMock.program.findUnique.mockResolvedValue({
        id: 'prog-dup',
        title: 'Dup Program',
        price: 100,
      });
      prismaMock.batch.findFirst.mockResolvedValue({ id: 'batch-dup', name: 'B1' });
      prismaMock.enrolment.create.mockResolvedValue({
        id: 'enrol-dup',
        batchId: 'batch-dup',
        programId: 'prog-dup',
        status: EnrolmentStatus.PENDING_PAYMENT,
      });

      await authService.signup(signupDto);

      // Program lookup and enrolment creation should only happen once
      expect(prismaMock.program.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.enrolment.create).toHaveBeenCalledTimes(1);
    });

    it('does NOT create a Default Cohort if no batch exists; safely skips enrolment', async () => {
      const signupDto: SignupDto = {
        name: 'No Batch User',
        email: 'nobatch@example.com',
        password: 'Password123!',
        programIds: ['prog-no-batch'],
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-nobatch',
        email: 'nobatch@example.com',
        name: 'No Batch User',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-nb' });

      prismaMock.program.findUnique.mockResolvedValue({
        id: 'prog-no-batch',
        title: 'Brand New Program',
        price: 50,
      });
      // No batch found for program
      prismaMock.batch.findFirst.mockResolvedValue(null);

      const response = await authService.signup(signupDto);

      // Crucial: signup must NOT create a batch!
      expect(prismaMock.batch.create).not.toHaveBeenCalled();
      expect(prismaMock.enrolment.create).not.toHaveBeenCalled();
      expect(response.user.enrolledPrograms).toHaveLength(0);
    });

    it('safely skips invalid or non-existent programIds', async () => {
      const signupDto: SignupDto = {
        name: 'Skip Prog',
        email: 'skipprog@example.com',
        password: 'Password123!',
        programIds: ['non-existent-prog'],
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-skip',
        email: 'skipprog@example.com',
        name: 'Skip Prog',
        role: Role.USER,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'evt-skip' });

      // Program not found
      prismaMock.program.findUnique.mockResolvedValue(null);

      const response = await authService.signup(signupDto);

      expect(prismaMock.batch.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.enrolment.create).not.toHaveBeenCalled();
      expect(response.user.enrolledPrograms).toHaveLength(0);
    });
  });

  describe('Email Verification (D1-015)', () => {
    it('successfully verifies user with valid token and consumes the token', async () => {
      const tokenStr = 'valid-token-uuid-1234';
      const mockToken = {
        id: 'evt-100',
        userId: 'user-100',
        token: tokenStr,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // in future
        usedAt: null,
        user: {
          id: 'user-100',
          email: 'test@example.com',
          emailVerifiedAt: null,
        },
      };

      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(mockToken);
      prismaMock.emailVerificationToken.update.mockResolvedValue({ ...mockToken, usedAt: new Date() });
      prismaMock.user.update.mockResolvedValue({ ...mockToken.user, emailVerifiedAt: new Date() });

      const result = await authService.verifyEmail(tokenStr);

      expect(prismaMock.emailVerificationToken.findUnique).toHaveBeenCalledWith({
        where: { token: tokenStr },
        include: { user: true },
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 'evt-100' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-100' },
        data: { emailVerifiedAt: expect.any(Date) },
      });

      expect(result).toEqual({
        success: true,
        message: 'Email verified successfully',
      });
    });

    it('rejects an already-consumed token (token cannot be reused)', async () => {
      const tokenStr = 'consumed-token-uuid';
      const mockToken = {
        id: 'evt-101',
        userId: 'user-101',
        token: tokenStr,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: new Date(Date.now() - 3600000), // already used 1 hour ago
        user: { id: 'user-101', email: 'test@example.com' },
      };

      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(mockToken);

      await expect(authService.verifyEmail(tokenStr)).rejects.toThrow(BadRequestException);
      await expect(authService.verifyEmail(tokenStr)).rejects.toThrow(
        'Invalid or expired verification token',
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      const tokenStr = 'expired-token-uuid';
      const mockToken = {
        id: 'evt-102',
        userId: 'user-102',
        token: tokenStr,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
        usedAt: null,
        user: { id: 'user-102', email: 'test@example.com' },
      };

      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(mockToken);

      await expect(authService.verifyEmail(tokenStr)).rejects.toThrow(BadRequestException);
      await expect(authService.verifyEmail(tokenStr)).rejects.toThrow(
        'Invalid or expired verification token',
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a nonexistent token', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(authService.verifyEmail('nonexistent-token')).rejects.toThrow(
        BadRequestException,
      );
      await expect(authService.verifyEmail('nonexistent-token')).rejects.toThrow(
        'Invalid or expired verification token',
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects token if associated user record does not exist', async () => {
      const mockToken = {
        id: 'evt-103',
        userId: 'deleted-user',
        token: 'orphan-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        user: null,
      };

      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(mockToken);

      await expect(authService.verifyEmail('orphan-token')).rejects.toThrow(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('does NOT issue access/refresh JWTs or create UserSession during verification', async () => {
      const mockToken = {
        id: 'evt-104',
        userId: 'user-104',
        token: 'valid-token-no-jwt',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        user: { id: 'user-104', email: 'nojwt@example.com' },
      };

      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(mockToken);

      const result = await authService.verifyEmail('valid-token-no-jwt');

      expect(jwtServiceMock.sign).not.toHaveBeenCalled();
      expect(prismaMock.userSession.create).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('access_token');
      expect(result).not.toHaveProperty('refresh_token');
    });

    it('does NOT expose sensitive token or user secrets in response payload', async () => {
      const mockToken = {
        id: 'evt-105',
        userId: 'user-105',
        token: 'sensitive-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        user: {
          id: 'user-105',
          email: 'secret@example.com',
          passwordHash: 'hash',
          twoFactorSecret: '2fa',
        },
      };

      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(mockToken);

      const result = await authService.verifyEmail('sensitive-token');

      expect(result).toEqual({
        success: true,
        message: 'Email verified successfully',
      });
      expect(result).not.toHaveProperty('token');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('twoFactorSecret');
    });

    it('rejects empty or malformed token string', async () => {
      await expect(authService.verifyEmail('')).rejects.toThrow(BadRequestException);
      await expect(authService.verifyEmail('   ')).rejects.toThrow(BadRequestException);
      await expect(authService.verifyEmail(null as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Credential Login (D1-016)', () => {
    it('successfully logs in with verified email and password, returning tokens and safe user payload', async () => {
      const plainPassword = 'ValidPassword123!';
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const mockUser = {
        id: 'user-login-1',
        email: 'learner@example.com',
        name: 'Learner One',
        phone: '+15551234567',
        role: Role.USER,
        companyId: 'company-1',
        country: 'US',
        timezone: 'America/New_York',
        passwordHash,
        emailVerifiedAt: new Date(),
        deletedAt: null,
        enrolments: [
          {
            id: 'enrol-1',
            batchId: 'batch-1',
            status: 'ACTIVE',
            batch: {
              name: 'Cohort Alpha',
              programId: 'prog-1',
              program: { title: 'Web Development' },
            },
          },
        ],
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      // Email login with mixed case and whitespace
      const result = await authService.login('  LEARNER@example.com  ', plainPassword);

      // Verifies normalization to lowercase and trim
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'learner@example.com' },
        include: expect.any(Object),
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user).toEqual({
        id: 'user-login-1',
        email: 'learner@example.com',
        name: 'Learner One',
        phone: '+15551234567',
        role: Role.USER,
        companyId: 'company-1',
        country: 'US',
        timezone: 'America/New_York',
        enrolledPrograms: [
          {
            enrolmentId: 'enrol-1',
            batchId: 'batch-1',
            batchName: 'Cohort Alpha',
            programId: 'prog-1',
            programTitle: 'Web Development',
            status: 'ACTIVE',
          },
        ],
      });
      // Ensure passwordHash and secrets are never leaked
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result.user as any).twoFactorSecret).toBeUndefined();
    });

    it('successfully logs in with phone number and password', async () => {
      const plainPassword = 'PhonePassword123!';
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const mockUser = {
        id: 'user-phone-1',
        email: 'phoneuser@example.com',
        name: 'Phone User',
        phone: '+15559876543',
        role: Role.USER,
        companyId: null,
        country: null,
        timezone: null,
        passwordHash,
        emailVerifiedAt: new Date(),
        deletedAt: null,
        enrolments: [],
      };

      prismaMock.user.findMany.mockResolvedValue([mockUser]);

      const result = await authService.login('+1 (555) 987-6543', plainPassword);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: {
          phone: { in: ['+15559876543', '+1 (555) 987-6543'] },
          deletedAt: null,
        },
        include: expect.any(Object),
        take: 2,
      });

      expect((result as any).user.id).toBe('user-phone-1');
      expect((result as any).user.email).toBe('phoneuser@example.com');
    });

    it('rejects wrong password with generic UnauthorizedException', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
      const mockUser = {
        id: 'user-wrong-pass',
        email: 'wrongpass@example.com',
        passwordHash,
        emailVerifiedAt: new Date(),
        deletedAt: null,
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.login('wrongpass@example.com', 'IncorrectPassword!'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.login('wrongpass@example.com', 'IncorrectPassword!'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects nonexistent identifier with generic UnauthorizedException without leaking existence', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('nonexistent@example.com', 'AnyPassword123!'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.login('nonexistent@example.com', 'AnyPassword123!'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects soft-deleted user with generic UnauthorizedException', async () => {
      const passwordHash = await bcrypt.hash('ValidPassword123!', 10);
      const mockUser = {
        id: 'deleted-user',
        email: 'deleted@example.com',
        passwordHash,
        emailVerifiedAt: new Date(),
        deletedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.login('deleted@example.com', 'ValidPassword123!'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.login('deleted@example.com', 'ValidPassword123!'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects unverified account with UnauthorizedException requiring email verification', async () => {
      const plainPassword = 'ValidPassword123!';
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const mockUser = {
        id: 'unverified-user',
        email: 'unverified@example.com',
        passwordHash,
        emailVerifiedAt: null, // Unverified account
        deletedAt: null,
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.login('unverified@example.com', plainPassword),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.login('unverified@example.com', plainPassword),
      ).rejects.toThrow('Please verify your email before logging in');
    });

    it('preserves existing user role on authenticated user payload', async () => {
      const plainPassword = 'ManagerPassword123!';
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const mockUser = {
        id: 'manager-user',
        email: 'manager@example.com',
        role: Role.MANAGER,
        passwordHash,
        emailVerifiedAt: new Date(),
        deletedAt: null,
        enrolments: [],
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.login('manager@example.com', plainPassword);

      expect((result as any).user.role).toBe(Role.MANAGER);
    });

    it('rejects empty identifier or empty password', async () => {
      await expect(authService.login('', 'password')).rejects.toThrow(UnauthorizedException);
      await expect(authService.login('   ', 'password')).rejects.toThrow(UnauthorizedException);
      await expect(authService.login('user@example.com', '')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Two-Device Concurrent Login Limit (D1-017)', () => {
    it('executes pg_advisory_xact_lock on userId and atomic limit eviction CTE in transaction', async () => {
      const userId = 'user-device-test-1';
      const role = Role.USER;
      const tokenHash = 'token-hash-xyz-123';
      const metadata = {
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (iPhone)',
        deviceFingerprint: 'fp-iphone-123',
      };

      const sessionId = await authService.createDeviceSession(userId, role, tokenHash, metadata);

      expect(typeof sessionId).toBe('string');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      // Verify transaction queries
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);

      // 1. Lock query
      const lockCallArgs = prismaMock.$executeRaw.mock.calls[0];
      const lockStrings = Array.isArray(lockCallArgs[0]) ? lockCallArgs[0] : lockCallArgs[0].strings;
      const lockSql = lockStrings.join('');
      expect(lockSql).toContain('SELECT pg_advisory_xact_lock(hashtext(');

      // 2. CTE eviction & insertion query
      const evictionCallArgs = prismaMock.$executeRaw.mock.calls[1];
      const evictionStrings = Array.isArray(evictionCallArgs[0]) ? evictionCallArgs[0] : evictionCallArgs[0].strings;
      const evictionSql = evictionStrings.join('');
      expect(evictionSql).toContain('WITH revoked AS');
      expect(evictionSql).toContain('UPDATE "UserSession"');
      expect(evictionSql).toContain("SET \"revokedAt\" = now(), \"revokedReason\" = 'DEVICE_LIMIT_EXCEEDED'");
      expect(evictionSql).toContain('WHERE "userId" =');
      expect(evictionSql).toContain('AND "revokedAt" IS NULL');
      expect(evictionSql).toContain('AND ("expiresAt" IS NULL OR "expiresAt" > now())');
      expect(evictionSql).toContain('ORDER BY "createdAt" DESC');
      expect(evictionSql).toContain('OFFSET');
      expect(evictionSql).toContain('INSERT INTO "UserSession"');

      // Verify metadata values are bound
      const values = evictionCallArgs.slice(1);
      expect(values).toContain(metadata.deviceFingerprint);
      expect(values).toContain(metadata.ipAddress);
      expect(values).toContain(metadata.userAgent);
    });

    describe('MAX_ACTIVE_SESSIONS environment variable parsing and bounds safety', () => {
      const originalEnv = process.env.MAX_ACTIVE_SESSIONS;

      afterEach(() => {
        if (originalEnv !== undefined) {
          process.env.MAX_ACTIVE_SESSIONS = originalEnv;
        } else {
          delete process.env.MAX_ACTIVE_SESSIONS;
        }
      });

      const getOffsetValue = async (envVal?: string) => {
        if (envVal !== undefined) {
          process.env.MAX_ACTIVE_SESSIONS = envVal;
        } else {
          delete process.env.MAX_ACTIVE_SESSIONS;
        }
        prismaMock.$executeRaw.mockClear();
        prismaMock.$transaction.mockClear();

        await authService.createDeviceSession('user-env-test', Role.USER, 'hash');
        const evictionArgs = prismaMock.$executeRaw.mock.calls[1];
        // evictionArgs[1] is userId, evictionArgs[2] is maxSessions - 1 (the OFFSET parameter)
        return evictionArgs[2];
      };

      it('defaults to 2 (OFFSET 1) when undefined or empty', async () => {
        expect(await getOffsetValue(undefined)).toBe(1);
        expect(await getOffsetValue('')).toBe(1);
      });

      it('defaults to 2 (OFFSET 1) for malformed values like "abc"', async () => {
        expect(await getOffsetValue('abc')).toBe(1);
      });

      it('defaults to 2 (OFFSET 1) for "0"', async () => {
        expect(await getOffsetValue('0')).toBe(1);
      });

      it('defaults to 2 (OFFSET 1) for negative values like "-1" or "-5"', async () => {
        expect(await getOffsetValue('-1')).toBe(1);
        expect(await getOffsetValue('-5')).toBe(1);
      });

      it('uses the valid positive integer value (e.g. 5 -> OFFSET 4)', async () => {
        expect(await getOffsetValue('5')).toBe(4);
        expect(await getOffsetValue('3')).toBe(2);
      });
    });

    it('getActiveSessions queries non-revoked and non-expired sessions for the user', async () => {
      const userId = 'user-active-query';
      const mockSessions = [
        { id: 'sess-1', userId, revokedAt: null, expiresAt: new Date(Date.now() + 100000) },
        { id: 'sess-2', userId, revokedAt: null, expiresAt: null },
      ];

      prismaMock.userSession.findMany.mockResolvedValue(mockSessions);

      const active = await authService.getActiveSessions(userId);

      expect(prismaMock.userSession.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: expect.any(Date) } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(active).toEqual(mockSessions);
    });

    describe('Stateful 2-Device Concurrency & Eviction Lifecycle Simulation', () => {
      interface MockSessionRow {
        id: string;
        userId: string;
        token: string;
        revokedAt: Date | null;
        revokedReason: string | null;
        expiresAt: Date | null;
        createdAt: Date;
      }

      let sessionStore: MockSessionRow[];
      let clockTime = 1000000;

      beforeEach(() => {
        sessionStore = [];
        clockTime = 1000000;
      });

      // Accurate simulator of PostgreSQL pg_advisory_xact_lock and the CTE update/insert
      const simulateCreateDeviceSession = async (
        userId: string,
        token: string,
        maxSessions = 2,
        customTime?: Date,
      ): Promise<string> => {
        clockTime += 1000;
        const now = customTime ?? new Date(clockTime);
        // Find active sessions for this user: unrevoked and unexpired
        const activeSessions = sessionStore
          .filter(
            (s) =>
              s.userId === userId &&
              s.revokedAt === null &&
              (s.expiresAt === null || s.expiresAt > now),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // Offset maxSessions - 1 leaves the newest active session, evicting the rest
        const toRevoke = activeSessions.slice(maxSessions - 1);
        for (const s of toRevoke) {
          s.revokedAt = now;
          s.revokedReason = 'DEVICE_LIMIT_EXCEEDED';
        }

        const newId = `sess-${clockTime}-${Math.random()}`;
        sessionStore.push({
          id: newId,
          userId,
          token,
          revokedAt: null,
          revokedReason: null,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          createdAt: now,
        });

        return newId;
      };

      const getActive = (userId: string, now?: Date) => {
        const checkTime = now ?? new Date(clockTime);
        return sessionStore.filter(
          (s) =>
            s.userId === userId &&
            s.revokedAt === null &&
            (s.expiresAt === null || s.expiresAt > checkTime),
        );
      };

      it('1. First login -> exactly one active session', async () => {
        const u1 = 'user-lifecycle-1';
        const s1 = await simulateCreateDeviceSession(u1, 'token-1');
        const active = getActive(u1);
        expect(active.length).toBe(1);
        expect(active[0].id).toBe(s1);
      });

      it('2. Second device login -> exactly two active sessions', async () => {
        const u1 = 'user-lifecycle-1';
        const s1 = await simulateCreateDeviceSession(u1, 'token-1');
        const s2 = await simulateCreateDeviceSession(u1, 'token-2');
        const active = getActive(u1);
        expect(active.length).toBe(2);
        expect(active.map((s) => s.id)).toEqual([s1, s2]);
      });

      it('3. Third device login -> oldest active session is revoked with DEVICE_LIMIT_EXCEEDED', async () => {
        const u1 = 'user-lifecycle-1';
        const t0 = new Date('2026-10-01T10:00:00Z');
        const t1 = new Date('2026-10-01T11:00:00Z');
        const t2 = new Date('2026-10-01T12:00:00Z');

        const s1 = await simulateCreateDeviceSession(u1, 'token-1', 2, t0);
        const s2 = await simulateCreateDeviceSession(u1, 'token-2', 2, t1);
        const s3 = await simulateCreateDeviceSession(u1, 'token-3', 2, t2);

        const active = getActive(u1, t2);
        expect(active.length).toBe(2);
        // Active must be s2 and s3 (newest 2)
        expect(active.map((s) => s.id)).toEqual([s2, s3]);

        // s1 must be revoked
        const s1Row = sessionStore.find((s) => s.id === s1);
        expect(s1Row?.revokedAt).toEqual(t2);
        expect(s1Row?.revokedReason).toBe('DEVICE_LIMIT_EXCEEDED');
      });

      it('4. Current/new session remains active after eviction', async () => {
        const u1 = 'user-lifecycle-1';
        const _s1 = await simulateCreateDeviceSession(u1, 'token-1');
        const _s2 = await simulateCreateDeviceSession(u1, 'token-2');
        const s3 = await simulateCreateDeviceSession(u1, 'token-3');

        const s3Row = sessionStore.find((s) => s.id === s3);
        expect(s3Row?.revokedAt).toBeNull();
        expect(s3Row?.revokedReason).toBeNull();
      });

      it('5. Concurrent login/session creation cannot leave more than two active sessions', async () => {
        const u1 = 'user-concurrency-test';
        // Simulate concurrent logins executed with serialized transactions (pg_advisory_xact_lock)
        const promises = [
          simulateCreateDeviceSession(u1, 'conc-token-1'),
          simulateCreateDeviceSession(u1, 'conc-token-2'),
          simulateCreateDeviceSession(u1, 'conc-token-3'),
          simulateCreateDeviceSession(u1, 'conc-token-4'),
        ];

        // Even with 4 logins, active sessions must never exceed 2
        await Promise.all(promises);
        const active = getActive(u1);
        expect(active.length).toBe(2);
      });

      it('6. Already-revoked and expired sessions are not counted toward the limit', async () => {
        const u1 = 'user-expiry-test';
        const past = new Date(Date.now() - 100000);
        const now = new Date();

        // 1 active session
        const sActive = await simulateCreateDeviceSession(u1, 'token-active', 2, now);

        // 1 expired session
        sessionStore.push({
          id: 'sess-expired',
          userId: u1,
          token: 'token-exp',
          revokedAt: null,
          revokedReason: null,
          expiresAt: past, // Expired
          createdAt: past,
        });

        // 1 manually revoked session
        sessionStore.push({
          id: 'sess-revoked',
          userId: u1,
          token: 'token-rev',
          revokedAt: past,
          revokedReason: 'LOGOUT',
          expiresAt: null,
          createdAt: past,
        });

        // User currently has only 1 active session (despite having 3 total session rows)
        expect(getActive(u1, now).length).toBe(1);

        // Logging in with device 2 should NOT revoke sActive because total active is 1 (< 2)
        const sNew = await simulateCreateDeviceSession(u1, 'token-new', 2, now);

        const active = getActive(u1, now);
        expect(active.length).toBe(2);
        expect(active.map((s) => s.id)).toContain(sActive);
        expect(active.map((s) => s.id)).toContain(sNew);

        // sActive remains unrevoked
        const sActiveRow = sessionStore.find((s) => s.id === sActive);
        expect(sActiveRow?.revokedAt).toBeNull();
      });

      it("7. Different users do not affect each other's session limits", async () => {
        const u1 = 'user-A';
        const u2 = 'user-B';

        // User A fills 2 sessions
        const _a1 = await simulateCreateDeviceSession(u1, 'token-a1');
        const a2 = await simulateCreateDeviceSession(u1, 'token-a2');

        // User B logs in with 1 session
        const b1 = await simulateCreateDeviceSession(u2, 'token-b1');

        // User B's login must not revoke User A's sessions
        expect(getActive(u1).length).toBe(2);
        expect(getActive(u2).length).toBe(1);

        // User A logs in with 3rd session -> only User A's oldest (a1) is revoked
        const a3 = await simulateCreateDeviceSession(u1, 'token-a3');

        expect(getActive(u1).map((s) => s.id)).toEqual([a2, a3]);
        expect(getActive(u2).map((s) => s.id)).toEqual([b1]); // User B unaffected
      });
    });
  });

  describe('JWT Access/Refresh Token Rotation (D1-018)', () => {
    const userId = 'user-rot-1';
    const mockUser = {
      id: userId,
      email: 'user-rot@example.com',
      name: 'Rotation User',
      role: Role.USER,
      companyId: 'comp-1',
      deletedAt: null,
      passwordHash: '$2b$10$hashed',
      emailVerifiedAt: new Date(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('1. Login returns valid access + refresh tokens with embedded sessionId in refresh token', async () => {
      const plainPassword = 'ValidPassword123!';
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash,
      });
      prismaMock.userSession.findMany.mockResolvedValue([]);
      prismaMock.$executeRaw.mockResolvedValue(1);

      jwtServiceMock.sign.mockImplementation((payload: any, options?: any) => {
        if (options?.expiresIn === '7d') return 'signed-refresh-token';
        if (options?.expiresIn === '15m') return 'signed-access-token';
        return 'signed-token';
      });

      const res = await authService.login('user-rot@example.com', plainPassword);

      expect(res.access_token).toBe('signed-access-token');
      expect(res.refresh_token).toBe('signed-refresh-token');

      // Verify sign was called for refresh token with 7d and sessionId
      const refreshSignCall = jwtServiceMock.sign.mock.calls.find(
        (call: any[]) => call[1]?.expiresIn === '7d',
      );
      expect(refreshSignCall).toBeDefined();
      expect(refreshSignCall[0]).toMatchObject({ sub: userId, sessionId: expect.any(String) });

      // Verify sign was called for access token with 15m and sessionId
      const accessSignCall = jwtServiceMock.sign.mock.calls.find(
        (call: any[]) => call[1]?.expiresIn === '15m',
      );
      expect(accessSignCall).toBeDefined();
      expect(accessSignCall[0]).toMatchObject({ sub: userId, sessionId: expect.any(String) });
    });

    it('2. Refresh with valid token returns new access + refresh token and updates session token with bcrypt hash', async () => {
      const sessionId = 'sess-rot-123';
      const oldRefreshToken = 'valid-old-refresh-token';
      const oldHash = await bcrypt.hash(oldRefreshToken, 10);

      jwtServiceMock.verify.mockReturnValue({ sub: userId, sessionId });
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        token: oldHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000000),
      });

      jwtServiceMock.sign.mockImplementation((payload: any, options?: any) => {
        if (options?.expiresIn === '7d') return 'new-rotated-refresh-token';
        if (options?.expiresIn === '15m') return 'new-rotated-access-token';
        return 'rotated-token';
      });

      prismaMock.userSession.update.mockResolvedValue({ id: sessionId });

      const res = await authService.refreshToken(oldRefreshToken);

      expect(res).toEqual({
        access_token: 'new-rotated-access-token',
        refresh_token: 'new-rotated-refresh-token',
      });

      // Verify update rotated the token hash and updated expiresAt & lastActive
      expect(prismaMock.userSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          token: expect.any(String),
          lastActive: expect.any(Date),
          expiresAt: expect.any(Date),
        },
      });

      // The new stored token must be a bcrypt hash (starts with $2)
      const updateData = prismaMock.userSession.update.mock.calls[0][0].data;
      expect(updateData.token).not.toBe('new-rotated-refresh-token');
      expect(updateData.token.startsWith('$2')).toBe(true);
    });

    it('3. Previous refresh token cannot be reused after rotation and triggers session revocation', async () => {
      const sessionId = 'sess-rot-reuse';
      const reusedToken = 'old-stale-refresh-token';
      // The session currently holds the hash of a NEW token (not reusedToken)
      const currentTokenHash = await bcrypt.hash('new-active-refresh-token', 10);

      jwtServiceMock.verify.mockReturnValue({ sub: userId, sessionId });
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        token: currentTokenHash, // Mismatch with reusedToken!
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000000),
      });

      await expect(authService.refreshToken(reusedToken)).rejects.toThrow(UnauthorizedException);

      // Session must be marked revoked with TOKEN_REUSED
      expect(prismaMock.userSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'TOKEN_REUSED',
        },
      });
    });

    it('4. Expired refresh token is rejected (both JWT expiration and session expiration)', async () => {
      // 4a. JWT verification throws TokenExpiredError
      const tokenExpiredErr = new Error('jwt expired');
      tokenExpiredErr.name = 'TokenExpiredError';
      jwtServiceMock.verify.mockImplementation(() => {
        throw tokenExpiredErr;
      });

      await expect(authService.refreshToken('expired-jwt-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // 4b. Session itself is expired (session.expiresAt <= now)
      jwtServiceMock.verify.mockReturnValue({ sub: userId, sessionId: 'sess-exp' });
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-exp',
        userId,
        token: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 10000), // in the past
      });

      await expect(authService.refreshToken('token-with-expired-session')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('5. Invalid / malformed refresh token is rejected', async () => {
      // 5a. Empty or non-string
      await expect(authService.refreshToken('')).rejects.toThrow(UnauthorizedException);
      await expect(authService.refreshToken(null as any)).rejects.toThrow(UnauthorizedException);

      // 5b. JsonWebTokenError (signature mismatch / malformed)
      const jwtErr = new Error('invalid signature');
      jwtErr.name = 'JsonWebTokenError';
      jwtServiceMock.verify.mockImplementation(() => {
        throw jwtErr;
      });

      await expect(authService.refreshToken('malformed-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('6. Refreshing does not create a third device session or call createDeviceSession', async () => {
      const sessionId = 'sess-existing';
      const rawToken = 'my-refresh-token';
      const hash = await bcrypt.hash(rawToken, 10);

      jwtServiceMock.verify.mockReturnValue({ sub: userId, sessionId });
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        token: hash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      jwtServiceMock.sign.mockReturnValue('new-token');
      prismaMock.userSession.update.mockResolvedValue({ id: sessionId });

      const createSpy = vi.spyOn(authService, 'createDeviceSession');

      await authService.refreshToken(rawToken);

      // Must not create a new device session
      expect(createSpy).not.toHaveBeenCalled();
      // Must update existing session by its exact id
      expect(prismaMock.userSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: sessionId } }),
      );
    });

    it('7. User not found or soft-deleted throws generic unauthorized without leaking info', async () => {
      jwtServiceMock.verify.mockReturnValue({ sub: 'missing-user', sessionId: 's1' });

      // User not found
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(authService.refreshToken('valid-sig-missing-user')).rejects.toThrow(
        UnauthorizedException,
      );

      // User soft deleted
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'deleted-user',
        deletedAt: new Date(),
      });
      await expect(authService.refreshToken('valid-sig-deleted-user')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('8. Session belonging to another user is rejected', async () => {
      const sessionId = 'sess-other-user';
      jwtServiceMock.verify.mockReturnValue({ sub: userId, sessionId });
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      // Session belongs to 'user-victim', not 'user-rot-1'
      prismaMock.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId: 'user-victim',
        token: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(authService.refreshToken('token')).rejects.toThrow(UnauthorizedException);
    });

    it('9. Concurrent refresh requests for the same session serialize via pg_advisory_xact_lock, preventing duplicate token issuance and triggering reuse revocation', async () => {
      const sessionId1 = 'sess-concurrent-1';
      const sessionId2 = 'sess-concurrent-2';
      const rawToken1 = 'refresh-token-session-1';
      const rawToken2 = 'refresh-token-session-2';

      const initialHash1 = await bcrypt.hash(rawToken1, 10);
      const initialHash2 = await bcrypt.hash(rawToken2, 10);

      const dbSessions = new Map<string, any>([
        [
          sessionId1,
          {
            id: sessionId1,
            userId,
            token: initialHash1,
            revokedAt: null,
            revokedReason: null,
            expiresAt: new Date(Date.now() + 1000000),
          },
        ],
        [
          sessionId2,
          {
            id: sessionId2,
            userId,
            token: initialHash2,
            revokedAt: null,
            revokedReason: null,
            expiresAt: new Date(Date.now() + 1000000),
          },
        ],
      ]);

      jwtServiceMock.verify.mockImplementation((token: string) => {
        if (token === rawToken1) return { sub: userId, sessionId: sessionId1 };
        if (token === rawToken2) return { sub: userId, sessionId: sessionId2 };
        throw new Error('unknown token');
      });

      let tokenCounter = 0;
      jwtServiceMock.sign.mockImplementation((payload: any, options?: any) => {
        if (options?.expiresIn === '7d') return `rotated-refresh-${++tokenCounter}`;
        return `rotated-access-${tokenCounter}`;
      });

      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      // Mutex lock simulation to accurately reflect pg_advisory_xact_lock per session ID
      const sessionLocks = new Map<string, Promise<void>>();
      const sessionLockResolvers = new Map<string, () => void>();

      const mockTx = {
        $executeRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
          const sql = Array.isArray(strings) ? strings.join('') : (strings as any).strings.join('');
          expect(sql).toContain('SELECT pg_advisory_xact_lock(hashtext(');
          const lockKey = values[0];

          // Wait if another transaction holds the lock on this key
          while (sessionLocks.has(lockKey)) {
            await sessionLocks.get(lockKey);
          }

          let resolveLock!: () => void;
          const lockPromise = new Promise<void>((resolve) => {
            resolveLock = resolve;
          });
          sessionLocks.set(lockKey, lockPromise);
          sessionLockResolvers.set(lockKey, resolveLock);
          return 1;
        }),
        userSession: {
          findUnique: vi.fn().mockImplementation(async ({ where: { id } }: any) => {
            const s = dbSessions.get(id);
            return s ? { ...s } : null;
          }),
          update: vi.fn().mockImplementation(async ({ where: { id }, data }: any) => {
            const s = dbSessions.get(id);
            if (s) {
              Object.assign(s, data);
            }
            return { ...s };
          }),
        },
      };

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        try {
          return await callback(mockTx);
        } finally {
          // Release lock for all sessions held by this tx
          for (const [key, resolve] of sessionLockResolvers.entries()) {
            sessionLocks.delete(key);
            resolve();
          }
          sessionLockResolvers.clear();
        }
      });

      // 1. Launch two simultaneous refresh requests using the exact same refresh token for session 1
      const req1Promise = authService.refreshToken(rawToken1);
      const req2Promise = authService.refreshToken(rawToken1);

      // Also launch a third request for session 2 concurrently (proves different sessions are not blocked)
      const req3Promise = authService.refreshToken(rawToken2);

      const [res1, res2Result, res3] = await Promise.all([
        req1Promise.catch((e) => e),
        req2Promise.catch((e) => e),
        req3Promise.catch((e) => e),
      ]);

      // Exactly one of req1 / req2 succeeds, and the other is rejected with UnauthorizedException
      const successCount = [res1, res2Result].filter((r) => r && r.access_token).length;
      const errorCount = [res1, res2Result].filter((r) => r instanceof UnauthorizedException).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(1);

      // Session 1 must end up revoked due to token reuse detection from the second concurrent request
      const session1 = dbSessions.get(sessionId1);
      expect(session1.revokedAt).not.toBeNull();
      expect(session1.revokedReason).toBe('TOKEN_REUSED');

      // Request 3 on Session 2 succeeded independently without being blocked or revoked
      expect(res3).toHaveProperty('access_token');
      expect(res3).toHaveProperty('refresh_token');
      const session2 = dbSessions.get(sessionId2);
      expect(session2.revokedAt).toBeNull();
    });
  });

  describe('Password Reset Flow (D1-021)', () => {
    const rawToken = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    describe('requestPasswordReset', () => {
      it('existing user requests reset successfully: token is generated securely and not returned by the API', async () => {
        const user = {
          id: 'user-reset-1',
          email: 'learner@example.com',
          deletedAt: null,
        };
        prismaMock.user.findUnique.mockResolvedValue(user);
        prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

        const res = await authService.requestPasswordReset('Learner@Example.Com ');

        expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
          where: { email: 'learner@example.com' },
        });
        expect(prismaMock.passwordResetToken.create).toHaveBeenCalledWith({
          data: {
            userId: user.id,
            token: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hex string
            expiresAt: expect.any(Date),
          },
        });

        // The API response must be generic and never leak the token or its hash
        expect(res).toEqual({
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
        expect((res as any).token).toBeUndefined();
        expect((res as any).rawToken).toBeUndefined();
      });

      it('nonexistent email receives the same generic request response without leaking existence', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);

        const res = await authService.requestPasswordReset('nonexistent@example.com');

        expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
        expect(res).toEqual({
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
      });

      it('deleted/non-eligible account does not leak existence', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-deleted',
          email: 'deleted@example.com',
          deletedAt: new Date(),
        });

        const res = await authService.requestPasswordReset('deleted@example.com');

        expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
        expect(res).toEqual({
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
      });
    });

    describe('confirmPasswordReset', () => {
      it('valid reset token succeeds: updates password hash, marks token used, and revokes all active sessions', async () => {
        const mockUser = {
          id: 'user-reset-1',
          email: 'learner@example.com',
          role: Role.USER,
          deletedAt: null,
        };

        const mockResetToken = {
          id: 'prt-1',
          userId: mockUser.id,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 3600000), // 1 hour future
          usedAt: null,
          user: mockUser,
        };

        prismaMock.passwordResetToken.findUnique.mockResolvedValue(mockResetToken);
        prismaMock.user.update.mockResolvedValue({});
        prismaMock.passwordResetToken.update.mockResolvedValue({});
        prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.userSession.updateMany.mockResolvedValue({ count: 2 });

        const res = await authService.confirmPasswordReset(rawToken, 'BrandNewSecurePassword123!');

        expect(res).toEqual({
          success: true,
          message: 'Password has been reset successfully',
        });

        // 1. Password updated with bcrypt hash
        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: {
            passwordHash: expect.stringMatching(/^\$2[aby]\$\d+\$/),
          },
        });

        // 2. Token marked as used
        expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
          where: { id: mockResetToken.id },
          data: { usedAt: expect.any(Date) },
        });

        // 3. Other unused tokens for this user invalidated
        expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
          where: {
            userId: mockUser.id,
            usedAt: null,
          },
          data: { usedAt: expect.any(Date) },
        });

        // 4. All active sessions revoked
        expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith({
          where: {
            userId: mockUser.id,
            revokedAt: null,
          },
          data: {
            revokedAt: expect.any(Date),
            revokedReason: 'PASSWORD_RESET',
          },
        });
      });

      it('invalid token fails generically', async () => {
        prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

        await expect(
          authService.confirmPasswordReset('non-existent-token', 'BrandNewSecurePassword123!'),
        ).rejects.toThrow(BadRequestException);
      });

      it('expired token fails generically', async () => {
        prismaMock.passwordResetToken.findUnique.mockResolvedValue({
          id: 'prt-expired',
          userId: 'user-1',
          token: tokenHash,
          expiresAt: new Date(Date.now() - 1000), // in the past
          usedAt: null,
          user: { id: 'user-1', deletedAt: null },
        });

        await expect(
          authService.confirmPasswordReset(rawToken, 'BrandNewSecurePassword123!'),
        ).rejects.toThrow(BadRequestException);
      });

      it('already-used token fails generically', async () => {
        prismaMock.passwordResetToken.findUnique.mockResolvedValue({
          id: 'prt-used',
          userId: 'user-1',
          token: tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
          usedAt: new Date(Date.now() - 5000), // already used
          user: { id: 'user-1', deletedAt: null },
        });

        await expect(
          authService.confirmPasswordReset(rawToken, 'BrandNewSecurePassword123!'),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects password shorter than 8 characters', async () => {
        await expect(
          authService.confirmPasswordReset(rawToken, 'short'),
        ).rejects.toThrow(BadRequestException);
      });

      it('new password is stored hashed and is usable for login, while old password fails', async () => {
        const oldPassword = 'OldPassword123!';
        const newPassword = 'BrandNewSecurePassword123!';
        const oldHash = await bcrypt.hash(oldPassword, 10);

        let savedNewHash = '';
        prismaMock.user.update.mockImplementation(async ({ data }: any) => {
          savedNewHash = data.passwordHash;
          return {};
        });

        const mockUser = {
          id: 'user-reset-pw',
          email: 'learner@example.com',
          role: Role.USER,
          passwordHash: oldHash,
          emailVerifiedAt: new Date(),
          deletedAt: null,
        };

        prismaMock.passwordResetToken.findUnique.mockResolvedValue({
          id: 'prt-login-test',
          userId: mockUser.id,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
          usedAt: null,
          user: mockUser,
        });

        await authService.confirmPasswordReset(rawToken, newPassword);
        expect(savedNewHash).toBeTruthy();

        // Simulate user record with new password hash
        const userWithNewPassword = {
          ...mockUser,
          passwordHash: savedNewHash,
          enrolments: [],
        };
        prismaMock.user.findUnique.mockResolvedValue(userWithNewPassword);

        // 1. Old password fails
        await expect(
          authService.login('learner@example.com', oldPassword),
        ).rejects.toThrow(UnauthorizedException);

        // 2. New password succeeds
        const loginRes = await authService.login('learner@example.com', newPassword);
        expect(loginRes).toHaveProperty('access_token');
        expect(loginRes).toHaveProperty('refresh_token');
      });

      it('session cache is invalidated and previously issued access JWT is rejected by D1-019 after reset', async () => {
        const sessionId = 'session-to-revoke-123';
        const userId = 'user-reset-session';

        // Populate session in cache as live
        rememberLiveSession(sessionId, userId);
        expect(sessionKnownLive(sessionId, userId)).toBe(true);

        const mockUser = {
          id: userId,
          email: 'user-session@example.com',
          role: Role.USER,
          deletedAt: null,
        };

        prismaMock.passwordResetToken.findUnique.mockResolvedValue({
          id: 'prt-session-test',
          userId,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
          usedAt: null,
          user: mockUser,
        });

        // Perform reset
        await authService.confirmPasswordReset(rawToken, 'BrandNewSecurePassword123!');

        // 1. In-memory session cache was invalidated
        expect(sessionKnownLive(sessionId, userId)).toBe(false);

        // 2. JWT Strategy (D1-019) validates against DB and rejects revoked session
        const revokedSessionInDb = {
          id: sessionId,
          userId,
          token: 'mock-token-hash',
          revokedAt: new Date(),
          revokedReason: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
        prismaMock.userSession.findUnique.mockResolvedValue(revokedSessionInDb);

        const jwtStrategy = new JwtStrategy(prismaMock as unknown as PrismaService);
        await expect(
          jwtStrategy.validate({ sub: userId, sessionId }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('previously issued refresh token cannot be used after reset', async () => {
        const sessionId = 'session-refresh-revoked';
        const userId = 'user-refresh-revoked';

        const mockUser = {
          id: userId,
          email: 'user-refresh@example.com',
          role: Role.USER,
          deletedAt: null,
        };

        prismaMock.passwordResetToken.findUnique.mockResolvedValue({
          id: 'prt-refresh-test',
          userId,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
          usedAt: null,
          user: mockUser,
        });

        await authService.confirmPasswordReset(rawToken, 'BrandNewSecurePassword123!');

        // Setup refresh token payload bound to the revoked session
        const oldRefreshToken = 'old-refresh-token';
        jwtServiceMock.verify.mockReturnValue({
          sub: userId,
          sessionId,
        });

        prismaMock.user.findUnique.mockResolvedValue(mockUser);
        prismaMock.userSession.findUnique.mockResolvedValue({
          id: sessionId,
          userId,
          token: await bcrypt.hash(oldRefreshToken, 10),
          revokedAt: new Date(),
          revokedReason: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        await expect(
          authService.refreshToken(oldRefreshToken),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('concurrent/repeated use of the same reset token cannot perform two successful resets', async () => {
        const userId = 'concurrent-reset-user';
        const tokenId = 'concurrent-reset-token';

        let tokenState = {
          id: tokenId,
          userId,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 3600000),
          usedAt: null as Date | null,
          user: { id: userId, deletedAt: null },
        };

        prismaMock.passwordResetToken.findUnique.mockImplementation(async () => ({ ...tokenState }));

        // Simulate PostgreSQL advisory transaction lock: serialize transactions per user
        let userLock: Promise<void> | null = null;
        let resolveUserLock: (() => void) | null = null;

        prismaMock.$transaction.mockImplementation(async (callback: any) => {
          while (userLock) {
            await userLock;
          }
          userLock = new Promise<void>((resolve) => {
            resolveUserLock = resolve;
          });

          const mockTx = {
            ...prismaMock,
            $executeRaw: vi.fn().mockResolvedValue(1),
            passwordResetToken: {
              findUnique: vi.fn().mockImplementation(async () => ({ ...tokenState })),
              update: vi.fn().mockImplementation(async ({ data }: any) => {
                tokenState = { ...tokenState, usedAt: data.usedAt };
                return tokenState;
              }),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            user: {
              update: vi.fn().mockResolvedValue({}),
            },
            userSession: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          };

          try {
            // Introduce slight delay to allow second concurrent promise to queue up
            await new Promise((resolve) => setTimeout(resolve, 15));
            return await callback(mockTx);
          } finally {
            const unlock = resolveUserLock;
            userLock = null;
            resolveUserLock = null;
            if (unlock) unlock();
          }
        });

        // Launch two simultaneous reset requests with the same token
        const req1 = authService.confirmPasswordReset(rawToken, 'NewPassword12345!');
        const req2 = authService.confirmPasswordReset(rawToken, 'NewPassword12345!');

        const [res1, res2] = await Promise.all([
          req1.catch((e) => e),
          req2.catch((e) => e),
        ]);

        const successes = [res1, res2].filter((r) => r && r.success === true);
        const failures = [res1, res2].filter((r) => r instanceof BadRequestException);

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(1);
        expect(tokenState.usedAt).not.toBeNull();
      });
    });
  });

  describe('AuthService - D1-022 TOTP / Admin Two-Factor Authentication', () => {
    const adminUser = {
      id: 'admin-uuid-1',
      email: 'admin@whatboutme.com',
      name: 'Super Admin',
      role: Role.SUPER_ADMIN,
      passwordHash: '',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
      deletedAt: null,
      emailVerifiedAt: new Date(),
    };

    beforeEach(async () => {
      adminUser.passwordHash = await bcrypt.hash('AdminSecret123!', 10);
      process.env.TOTP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });

    describe('1. Role-based access control for 2FA setup', () => {
      it('allows SUPER_ADMIN to generate TOTP secret', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.SUPER_ADMIN });
        const res = await authService.generate2faSecret(adminUser.id);
        expect(res).toHaveProperty('secret');
        expect(res).toHaveProperty('otpauthUrl');
        expect(res.otpauthUrl).toContain('otpauth://totp/WhatBoutMe');
      });

      it('allows ADMIN to generate TOTP secret', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.ADMIN });
        const res = await authService.generate2faSecret(adminUser.id);
        expect(res).toHaveProperty('secret');
        expect(res.otpauthUrl).toContain('otpauth://totp/WhatBoutMe');
      });

      it('denies MANAGER from generating 2FA secret with ForbiddenException', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.MANAGER });
        await expect(authService.generate2faSecret(adminUser.id)).rejects.toThrow(ForbiddenException);
      });

      it('denies USER from generating 2FA secret with ForbiddenException', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.USER });
        await expect(authService.generate2faSecret(adminUser.id)).rejects.toThrow(ForbiddenException);
      });

      it('denies MANAGER from enabling 2FA with ForbiddenException', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.MANAGER });
        await expect(authService.enable2fa(adminUser.id, '123456', 'JBSWY3DPEHPK3PXP')).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('denies USER from enabling 2FA with ForbiddenException', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.USER });
        await expect(authService.enable2fa(adminUser.id, '123456', 'JBSWY3DPEHPK3PXP')).rejects.toThrow(
          ForbiddenException,
        );
      });
    });

    describe('2. Secret Generation & Protection (/auth/2fa/generate)', () => {
      it('generates a valid Base32 RFC 4648 secret and does NOT enable 2FA or touch DB', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.ADMIN });
        const res = await authService.generate2faSecret(adminUser.id);

        expect(typeof res.secret).toBe('string');
        expect(res.secret.length).toBeGreaterThanOrEqual(16);
        expect(/^[A-Z2-7]+$/.test(res.secret)).toBe(true);
        expect(res.otpauthUrl).toContain(`secret=${res.secret}`);
        expect(res.otpauthUrl).toContain('WhatBoutMe');
        // DB update is never called during generate
        expect(prismaMock.user.update).not.toHaveBeenCalled();
      });
    });

    describe('3. Enable 2FA & Backup Codes (/auth/2fa/enable)', () => {
      it('enables 2FA with valid TOTP code, encrypts secret with AES-256-GCM, and issues 10 backup codes', async () => {
        const secret = generateTotpSecret();
        const code = generateTotp(secret);

        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.ADMIN });
        let updatedData: any = null;
        prismaMock.user.update.mockImplementation(async ({ data }: any) => {
          updatedData = data;
          return { ...adminUser, ...data };
        });

        const res = await authService.enable2fa(adminUser.id, code, secret);

        expect(res.success).toBe(true);
        expect(res.message).toContain('enabled successfully');
        expect(res.backupCodes).toHaveLength(10);
        // Backup codes are returned raw only once
        for (const bc of res.backupCodes) {
          expect(typeof bc).toBe('string');
          expect(bc.length).toBe(8);
        }

        // Verify DB update: secret is encrypted (iv:tag:data), not plaintext
        expect(updatedData).not.toBeNull();
        expect(updatedData.twoFactorEnabled).toBe(true);
        expect(updatedData.twoFactorSecret).not.toEqual(secret);
        expect(updatedData.twoFactorSecret.split(':')).toHaveLength(3);

        // Verify secret can be decrypted with AES-256-GCM to original secret
        const decrypted = decryptTotpSecret(updatedData.twoFactorSecret);
        expect(decrypted).toBe(secret);

        // Verify backup codes stored in DB are SHA-256 hashes, not plaintext
        expect(updatedData.twoFactorBackupCodes).toHaveLength(10);
        for (let i = 0; i < 10; i++) {
          const rawCode = res.backupCodes[i];
          const expectedHash = hashBackupCode(rawCode);
          expect(updatedData.twoFactorBackupCodes).toContain(expectedHash);
          expect(updatedData.twoFactorBackupCodes).not.toContain(rawCode);
        }
      });

      it('rejects enable2fa with invalid TOTP code and does not modify user state', async () => {
        const secret = generateTotpSecret();
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.ADMIN });

        await expect(authService.enable2fa(adminUser.id, '000000', secret)).rejects.toThrow(BadRequestException);
        expect(prismaMock.user.update).not.toHaveBeenCalled();
      });

      it('rejects enable2fa when secret is missing', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.ADMIN });
        await expect(authService.enable2fa(adminUser.id, '123456', '')).rejects.toThrow(BadRequestException);
      });

      it('rejects enable2fa when setup secret has invalid Base32 characters', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.ADMIN });
        await expect(authService.enable2fa(adminUser.id, '123456', 'INVALID!@#SECRET')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('rejects enable2fa when setup secret is shorter than 16 characters', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...adminUser, role: Role.ADMIN });
        await expect(authService.enable2fa(adminUser.id, '123456', 'SHORT')).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('4. Admin Login Integration & 2FA Challenge', () => {
      it('adminLogin for admin with 2FA enabled returns tempToken and does NOT create UserSession', async () => {
        const secret = generateTotpSecret();
        const encryptedSecret = encryptTotpSecret(secret);

        prismaMock.user.findUnique.mockResolvedValue({
          ...adminUser,
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        });

        jwtServiceMock.sign.mockReturnValue('mock-2fa-temp-jwt');

        const res = await authService.adminLogin(adminUser.email, 'AdminSecret123!');

        expect(res).toEqual({
          requires2fa: true,
          tempToken: 'mock-2fa-temp-jwt',
        });
        // No session created, no access_token
        expect(res).not.toHaveProperty('access_token');
        expect(prismaMock.userSession.create).not.toHaveBeenCalled();
        expect(jwtServiceMock.sign).toHaveBeenCalledWith(
          { sub: adminUser.id, purpose: '2fa_login' },
          expect.objectContaining({ expiresIn: '5m' }),
        );
      });

      it('adminLogin for admin WITHOUT 2FA enabled issues normal session with requires2faSetup flag', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...adminUser,
          twoFactorEnabled: false,
        });

        prismaMock.userSession.create.mockResolvedValue({ id: 'session-admin-1' });
        jwtServiceMock.sign
          .mockReturnValueOnce('mock-admin-refresh')
          .mockReturnValueOnce('mock-admin-access');

        const res = await authService.adminLogin(adminUser.email, 'AdminSecret123!');

        expect(res).toHaveProperty('access_token');
        expect(res).toHaveProperty('refresh_token');
        expect(res.requires2faSetup).toBe(true);
        expect(prismaMock.$transaction).toHaveBeenCalled();
      });

      it('prevent 2FA bypass: calling /auth/login for 2FA-enabled admin also requires 2FA', async () => {
        const secret = generateTotpSecret();
        prismaMock.user.findUnique.mockResolvedValue({
          ...adminUser,
          twoFactorEnabled: true,
          twoFactorSecret: encryptTotpSecret(secret),
        });

        jwtServiceMock.sign.mockReturnValue('mock-login-temp-jwt');

        const res = await authService.login(adminUser.email, 'AdminSecret123!');

        expect(res).toEqual({
          requires2fa: true,
          tempToken: 'mock-login-temp-jwt',
        });
        expect(prismaMock.userSession.create).not.toHaveBeenCalled();
      });

      it('normal learner and manager login behavior remains unchanged', async () => {
        const learnerPassword = await bcrypt.hash('LearnerPass123!', 10);
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'learner-1',
          email: 'learner@example.com',
          name: 'Learner One',
          role: Role.USER,
          passwordHash: learnerPassword,
          emailVerifiedAt: new Date(),
          twoFactorEnabled: false,
        });

        prismaMock.userSession.create.mockResolvedValue({ id: 'sess-l-1' });
        jwtServiceMock.sign.mockReturnValue('learner-token');

        const res = await authService.login('learner@example.com', 'LearnerPass123!');

        expect(res).toHaveProperty('access_token');
        expect(res).not.toHaveProperty('requires2fa');
      });
    });

    describe('5. Complete 2FA Verification (/auth/2fa/verify)', () => {
      it('completes login with valid TOTP code and creates canonical UserSession', async () => {
        const secret = generateTotpSecret();
        const encryptedSecret = encryptTotpSecret(secret);
        const code = generateTotp(secret);

        jwtServiceMock.verify.mockReturnValue({
          sub: adminUser.id,
          purpose: '2fa_login',
        });

        prismaMock.user.findUnique.mockResolvedValue({
          ...adminUser,
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        });

        prismaMock.userSession.create.mockResolvedValue({ id: 'canonical-admin-session' });
        jwtServiceMock.sign
          .mockReturnValueOnce('refresh-after-2fa')
          .mockReturnValueOnce('access-after-2fa');

        const res = await authService.verify2fa('valid-temp-token', code, {
          ipAddress: '127.0.0.1',
          userAgent: 'Admin-Test-Agent',
        });

        expect(res).toHaveProperty('access_token', 'access-after-2fa');
        expect(res).toHaveProperty('refresh_token', 'refresh-after-2fa');
        expect(res.user).toEqual({
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
        });
        expect(prismaMock.$transaction).toHaveBeenCalled();
      });

      it('completes login with valid single-use backup code and atomically consumes it', async () => {
        const rawBackupCodes = generateBackupCodes(5);
        const hashedBackupCodes = rawBackupCodes.map(hashBackupCode);
        const secret = generateTotpSecret();
        const codeToUse = rawBackupCodes[2];

        jwtServiceMock.verify.mockReturnValue({
          sub: adminUser.id,
          purpose: '2fa_login',
        });

        let currentBackupCodes = [...hashedBackupCodes];
        prismaMock.user.findUnique.mockImplementation(async () => ({
          ...adminUser,
          twoFactorEnabled: true,
          twoFactorSecret: encryptTotpSecret(secret),
          twoFactorBackupCodes: currentBackupCodes,
        }));

        prismaMock.user.update.mockImplementation(async ({ data }: any) => {
          currentBackupCodes = data.twoFactorBackupCodes;
          return { ...adminUser, twoFactorBackupCodes: currentBackupCodes };
        });

        prismaMock.userSession.create.mockResolvedValue({ id: 'session-backup-code' });
        jwtServiceMock.sign
          .mockReturnValueOnce('refresh-backup')
          .mockReturnValueOnce('access-backup');

        const res = await authService.verify2fa('valid-temp-token', codeToUse);

        expect(res).toHaveProperty('access_token', 'access-backup');
        // The used backup code should be consumed
        const usedHash = hashBackupCode(codeToUse);
        expect(currentBackupCodes).not.toContain(usedHash);
        expect(currentBackupCodes).toHaveLength(4);

        // Replay attempt with same backup code fails
        await expect(authService.verify2fa('valid-temp-token', codeToUse)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects invalid TOTP code and invalid backup code with UnauthorizedException', async () => {
        const secret = generateTotpSecret();
        jwtServiceMock.verify.mockReturnValue({
          sub: adminUser.id,
          purpose: '2fa_login',
        });

        prismaMock.user.findUnique.mockResolvedValue({
          ...adminUser,
          twoFactorEnabled: true,
          twoFactorSecret: encryptTotpSecret(secret),
          twoFactorBackupCodes: [hashBackupCode('VALIDONE')],
        });

        await expect(authService.verify2fa('valid-temp-token', '999999')).rejects.toThrow(
          UnauthorizedException,
        );
        expect(prismaMock.userSession.create).not.toHaveBeenCalled();
      });

      it('rejects invalid or expired tempToken', async () => {
        jwtServiceMock.verify.mockImplementation(() => {
          throw new Error('jwt expired');
        });

        await expect(authService.verify2fa('expired-temp-token', '123456')).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects tempToken with incorrect purpose', async () => {
        jwtServiceMock.verify.mockReturnValue({
          sub: adminUser.id,
          purpose: 'some_other_purpose',
        });

        await expect(authService.verify2fa('wrong-purpose-token', '123456')).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects verify2fa when user role is not ADMIN or SUPER_ADMIN', async () => {
        jwtServiceMock.verify.mockReturnValue({
          sub: 'user-manager-1',
          purpose: '2fa_login',
        });
        prismaMock.user.findUnique.mockResolvedValue({
          ...adminUser,
          id: 'user-manager-1',
          role: Role.MANAGER,
          twoFactorEnabled: true,
          twoFactorSecret: 'enc-secret',
        });

        await expect(authService.verify2fa('valid-temp-token', '123456')).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('concurrent backup-code consumption: exactly one request consumes the code and succeeds under advisory lock', async () => {
        const rawBackupCodes = generateBackupCodes(5);
        const hashedBackupCodes = rawBackupCodes.map(hashBackupCode);
        const secret = generateTotpSecret();
        const codeToUse = rawBackupCodes[0];
        const targetHash = hashBackupCode(codeToUse);

        jwtServiceMock.verify.mockReturnValue({
          sub: adminUser.id,
          purpose: '2fa_login',
        });

        // Shared database state
        let currentCodes = [...hashedBackupCodes];
        let activeLock: Promise<void> | null = null;
        let releaseLock: (() => void) | null = null;

        prismaMock.user.findUnique.mockImplementation(async () => ({
          ...adminUser,
          twoFactorEnabled: true,
          twoFactorSecret: encryptTotpSecret(secret),
          twoFactorBackupCodes: currentCodes,
        }));

        prismaMock.$transaction.mockImplementation(async (callback: any) => {
          if (Array.isArray(callback)) {
            return Promise.all(callback);
          }
          // Simulate serialized PostgreSQL advisory transaction lock
          while (activeLock) {
            await activeLock;
          }
          activeLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });

          const mockTx = {
            ...prismaMock,
            $executeRaw: vi.fn().mockResolvedValue(1),
            user: {
              findUnique: vi.fn().mockImplementation(async () => ({
                ...adminUser,
                twoFactorEnabled: true,
                twoFactorSecret: encryptTotpSecret(secret),
                twoFactorBackupCodes: [...currentCodes],
              })),
              update: vi.fn().mockImplementation(async ({ data }: any) => {
                currentCodes = [...data.twoFactorBackupCodes];
                return { ...adminUser, twoFactorBackupCodes: currentCodes };
              }),
            },
          };

          try {
            // Tiny delay to allow second concurrent promise to queue up on the lock
            await new Promise((resolve) => setTimeout(resolve, 15));
            return await callback(mockTx);
          } finally {
            const unlock = releaseLock;
            activeLock = null;
            releaseLock = null;
            if (unlock) unlock();
          }
        });

        // Launch simultaneous concurrent verify2fa requests using the same backup code
        const req1 = authService.verify2fa('valid-temp-token', codeToUse);
        const req2 = authService.verify2fa('valid-temp-token', codeToUse);

        const [res1, res2] = await Promise.all([
          req1.catch((e) => e),
          req2.catch((e) => e),
        ]);

        const successes = [res1, res2].filter((r) => r && (r as any).access_token);
        const failures = [res1, res2].filter((r) => r instanceof UnauthorizedException);

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(1);
        expect(currentCodes).not.toContain(targetHash);
        expect(currentCodes.length).toBe(4);
      });
    });

    describe('6. Security Guarantees & Token Invalidation', () => {
      it('tempToken cannot be used to authenticate normal protected routes via JwtStrategy', async () => {
        const strategy = new JwtStrategy(prismaMock as unknown as PrismaService);

        // The tempToken payload has sub and purpose: '2fa_login', but NO sessionId
        const tempTokenPayload = {
          sub: adminUser.id,
          purpose: '2fa_login',
        };

        await expect(strategy.validate(tempTokenPayload)).rejects.toThrow(UnauthorizedException);
      });

      it('twoFactorSecret and twoFactorBackupCodes are never exposed in user responses', async () => {
        const secret = generateTotpSecret();
        prismaMock.user.findUnique.mockResolvedValue({
          ...adminUser,
          twoFactorEnabled: true,
          twoFactorSecret: encryptTotpSecret(secret),
          twoFactorBackupCodes: [hashBackupCode('BACKUP01')],
          enrolments: [],
        });
        prismaMock.session.findMany.mockResolvedValue([]);

        const profile = await authService.getProfile(adminUser.id);

        expect(profile).not.toHaveProperty('twoFactorSecret');
        expect(profile).not.toHaveProperty('twoFactorBackupCodes');
        expect((profile as any).twoFactorSecret).toBeUndefined();
        expect((profile as any).twoFactorBackupCodes).toBeUndefined();
      });
    });
  });

  describe('D1-023: Logout & Session Management', () => {
    const userId = 'user-d1-023-test';
    const currentSessionId = 'sess-current-123';
    const otherSessionId = 'sess-other-456';

    describe('1. Logout Current Session', () => {
      it('revokes only the current UserSession with LOGOUT reason and clears cache', async () => {
        prismaMock.userSession.updateMany.mockResolvedValue({ count: 1 });

        const result = await authService.logout(userId, currentSessionId);

        expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith({
          where: {
            id: currentSessionId,
            userId,
            revokedAt: null,
          },
          data: {
            revokedAt: expect.any(Date),
            revokedReason: 'LOGOUT',
          },
        });
        expect(result).toEqual({
          success: true,
          message: 'Logged out successfully',
        });
      });

      it('is idempotent when session is already revoked or missing', async () => {
        prismaMock.userSession.updateMany.mockResolvedValue({ count: 0 });

        const result = await authService.logout(userId, 'non-existent-or-already-revoked');

        expect(result).toEqual({
          success: true,
          message: 'Logged out successfully',
        });
      });

      it('succeeds gracefully when sessionId is undefined', async () => {
        const result = await authService.logout(userId, undefined);

        expect(prismaMock.userSession.updateMany).not.toHaveBeenCalled();
        expect(result).toEqual({
          success: true,
          message: 'Logged out successfully',
        });
      });
    });

    describe('2. Logout All Sessions', () => {
      it('revokes all active UserSessions for the user with LOGOUT_ALL reason', async () => {
        prismaMock.userSession.updateMany.mockResolvedValue({ count: 3 });

        const result = await authService.logoutAll(userId);

        expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith({
          where: {
            userId,
            revokedAt: null,
          },
          data: {
            revokedAt: expect.any(Date),
            revokedReason: 'LOGOUT_ALL',
          },
        });
        expect(result).toEqual({
          success: true,
          count: 3,
          message: 'All sessions logged out successfully',
        });
      });
    });

    describe('3. Session Listing', () => {
      it('returns safe metadata only and sets isCurrent correctly', async () => {
        const mockSessions = [
          {
            id: currentSessionId,
            userId,
            token: '$2a$10$secretHashMustNotBeExposed1',
            deviceFingerprint: 'fp-chrome-laptop',
            ipAddress: '192.168.1.10',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            lastActive: new Date('2026-10-05T10:00:00Z'),
            expiresAt: new Date('2026-10-12T10:00:00Z'),
            createdAt: new Date('2026-10-05T09:00:00Z'),
            revokedAt: null,
            revokedReason: null,
          },
          {
            id: otherSessionId,
            userId,
            token: '$2a$10$secretHashMustNotBeExposed2',
            deviceFingerprint: 'fp-safari-iphone',
            ipAddress: '192.168.1.20',
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
            lastActive: new Date('2026-10-05T08:00:00Z'),
            expiresAt: new Date('2026-10-12T08:00:00Z'),
            createdAt: new Date('2026-10-05T07:00:00Z'),
            revokedAt: null,
            revokedReason: null,
          },
        ];

        prismaMock.userSession.findMany.mockResolvedValue(mockSessions);

        const list = await authService.getSessions(userId, currentSessionId);

        expect(list).toHaveLength(2);

        // Safe fields only
        expect(list[0]).toEqual({
          id: currentSessionId,
          deviceFingerprint: 'fp-chrome-laptop',
          ipAddress: '192.168.1.10',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          lastActive: mockSessions[0].lastActive,
          expiresAt: mockSessions[0].expiresAt,
          createdAt: mockSessions[0].createdAt,
          isCurrent: true,
        });

        expect(list[1]).toEqual({
          id: otherSessionId,
          deviceFingerprint: 'fp-safari-iphone',
          ipAddress: '192.168.1.20',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          lastActive: mockSessions[1].lastActive,
          expiresAt: mockSessions[1].expiresAt,
          createdAt: mockSessions[1].createdAt,
          isCurrent: false,
        });

        // Security check: no tokens or secrets
        expect(list[0]).not.toHaveProperty('token');
        expect(list[1]).not.toHaveProperty('token');
        expect((list[0] as any).token).toBeUndefined();
      });
    });

    describe('4. Revoke Specific Session', () => {
      it('allows a user to revoke an active session belonging to themselves', async () => {
        prismaMock.userSession.findUnique.mockResolvedValue({
          id: otherSessionId,
          userId,
          revokedAt: null,
        });
        prismaMock.userSession.update.mockResolvedValue({
          id: otherSessionId,
          revokedAt: new Date(),
          revokedReason: 'USER_REVOKED',
        });

        const result = await authService.revokeSession(userId, otherSessionId, currentSessionId);

        expect(prismaMock.userSession.update).toHaveBeenCalledWith({
          where: { id: otherSessionId },
          data: {
            revokedAt: expect.any(Date),
            revokedReason: 'USER_REVOKED',
          },
        });
        expect(result).toEqual({
          success: true,
          message: 'Session revoked successfully',
          isCurrent: false,
        });
      });

      it('correctly reports isCurrent: true when the user revokes their own current session', async () => {
        prismaMock.userSession.findUnique.mockResolvedValue({
          id: currentSessionId,
          userId,
          revokedAt: null,
        });
        prismaMock.userSession.update.mockResolvedValue({
          id: currentSessionId,
          revokedAt: new Date(),
          revokedReason: 'USER_REVOKED',
        });

        const result = await authService.revokeSession(userId, currentSessionId, currentSessionId);

        expect(result).toEqual({
          success: true,
          message: 'Session revoked successfully',
          isCurrent: true,
        });
      });

      it('rejects with NotFoundException when session belongs to a different user', async () => {
        prismaMock.userSession.findUnique.mockResolvedValue({
          id: 'victim-session-id',
          userId: 'other-victim-user-id',
          revokedAt: null,
        });

        await expect(
          authService.revokeSession(userId, 'victim-session-id', currentSessionId),
        ).rejects.toThrow(NotFoundException);
        expect(prismaMock.userSession.update).not.toHaveBeenCalled();
      });

      it('rejects with NotFoundException when session does not exist', async () => {
        prismaMock.userSession.findUnique.mockResolvedValue(null);

        await expect(
          authService.revokeSession(userId, 'non-existent-session', currentSessionId),
        ).rejects.toThrow(NotFoundException);
        expect(prismaMock.userSession.update).not.toHaveBeenCalled();
      });

      it('returns success when session is already revoked without attempting redundant update', async () => {
        prismaMock.userSession.findUnique.mockResolvedValue({
          id: otherSessionId,
          userId,
          revokedAt: new Date('2026-10-01'),
        });

        const result = await authService.revokeSession(userId, otherSessionId, currentSessionId);

        expect(prismaMock.userSession.update).not.toHaveBeenCalled();
        expect(result).toEqual({
          success: true,
          message: 'Session is already revoked',
          isCurrent: false,
        });
      });

      it('rejects when sessionId is empty string', async () => {
        await expect(
          authService.revokeSession(userId, '', currentSessionId),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('5. Integration: Revocation Enforcement on Refresh and JWT Validation', () => {
      it('revoked session immediately fails refresh token rotation with SESSION_REVOKED', async () => {
        const rawRefreshToken = 'valid.jwt.refreshToken';
        const refreshTokenPayload = {
          sub: userId,
          sessionId: otherSessionId,
        };

        jwtServiceMock.verify.mockReturnValue(refreshTokenPayload);
        prismaMock.user.findUnique.mockResolvedValue({
          id: userId,
          email: 'user@test.com',
          role: Role.USER,
          deletedAt: null,
        });

        prismaMock.$transaction.mockImplementation(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn(),
            userSession: {
              findUnique: vi.fn().mockResolvedValue({
                id: otherSessionId,
                userId,
                token: '$2a$10$someHash',
                revokedAt: new Date(), // Revoked!
                revokedReason: 'USER_REVOKED',
                expiresAt: new Date(Date.now() + 100000),
              }),
            },
          };
          return callback(mockTx);
        });

        await expect(authService.refreshToken(rawRefreshToken)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('revoked session immediately fails JwtStrategy validation with SESSION_REVOKED', async () => {
        const strategy = new JwtStrategy(prismaMock as unknown as PrismaService);

        prismaMock.userSession.findUnique.mockResolvedValue({
          id: otherSessionId,
          userId,
          revokedAt: new Date(), // Revoked!
          expiresAt: new Date(Date.now() + 100000),
        });

        const jwtPayload = {
          sub: userId,
          sessionId: otherSessionId,
          email: 'user@test.com',
          role: Role.USER,
        };

        await expect(strategy.validate(jwtPayload)).rejects.toThrow(UnauthorizedException);
      });
    });
  });
});
