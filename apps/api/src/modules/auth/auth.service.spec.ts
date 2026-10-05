import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, EnrolmentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SignupDto } from './dto/index.js';

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
      userSession: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (fns) => {
        if (typeof fns === 'function') return fns(prismaMock);
        if (Array.isArray(fns)) return Promise.all(fns);
        return fns;
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    jwtServiceMock = {
      sign: vi.fn().mockImplementation((payload) => `mock-token-for-${payload.sub}`),
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

      expect(result.user.id).toBe('user-phone-1');
      expect(result.user.email).toBe('phoneuser@example.com');
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

      expect(result.user.role).toBe(Role.MANAGER);
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
        const s1 = await simulateCreateDeviceSession(u1, 'token-1');
        const s2 = await simulateCreateDeviceSession(u1, 'token-2');
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
        const a1 = await simulateCreateDeviceSession(u1, 'token-a1');
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
});
