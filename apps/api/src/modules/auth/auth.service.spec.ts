import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, EnrolmentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SignupDto } from './dto/index.js';

describe('AuthService - Signup (D1-014)', () => {
  let authService: AuthService;
  let prismaMock: any;
  let jwtServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      emailVerificationToken: {
        create: vi.fn(),
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
      userSession: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (fns) => {
        if (typeof fns === 'function') return fns(prismaMock);
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
});
