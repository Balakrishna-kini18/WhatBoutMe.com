import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  SignupDto,
  LoginDto,
  EmailVerificationDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  OtpSendDto,
  OtpVerifyDto,
  TotpSetupDto,
  TotpVerifyDto,
  RefreshDto,
} from './index.js';

describe('Authentication DTOs (D1-013 Validation)', () => {
  describe('SignupDto', () => {
    it('should validate a valid signup payload with country and timezone', async () => {
      const dto = plainToInstance(SignupDto, {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'SecurePassword123!',
        country: 'AU',
        timezone: 'Australia/Sydney',
        phone: '+61400000000',
        programIds: ['prog-1', 'prog-2'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when name, email, or password are missing', async () => {
      const dto = plainToInstance(SignupDto, {});
      const errors = await validate(dto);
      const propertyErrors = errors.map((e) => e.property);
      expect(propertyErrors).toContain('name');
      expect(propertyErrors).toContain('email');
      expect(propertyErrors).toContain('password');
    });

    it('should fail when email is invalid format', async () => {
      const dto = plainToInstance(SignupDto, {
        name: 'Jane Doe',
        email: 'not-an-email',
        password: 'ValidPassword123',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });

    it('should fail when password is shorter than 8 characters', async () => {
      const dto = plainToInstance(SignupDto, {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'short',
      });
      const errors = await validate(dto);
      const passwordError = errors.find((e) => e.property === 'password');
      expect(passwordError).toBeDefined();
      expect(passwordError?.constraints?.minLength).toBeDefined();
    });
  });

  describe('LoginDto', () => {
    it('should validate email + password login', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'learner@example.com',
        password: 'Password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate phone + password login', async () => {
      const dto = plainToInstance(LoginDto, {
        phone: '+61400000000',
        password: 'Password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when neither email nor phone is provided', async () => {
      const dto = plainToInstance(LoginDto, {
        password: 'Password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when password is missing', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'learner@example.com',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });
  });

  describe('EmailVerificationDto', () => {
    it('should validate valid token', async () => {
      const dto = plainToInstance(EmailVerificationDto, {
        token: 'verify-token-xyz-123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when token is empty or missing', async () => {
      const dto = plainToInstance(EmailVerificationDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'token')).toBe(true);
    });
  });

  describe('PasswordResetRequestDto', () => {
    it('should validate valid email', async () => {
      const dto = plainToInstance(PasswordResetRequestDto, {
        email: 'reset@example.com',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail on invalid or missing email', async () => {
      const dto = plainToInstance(PasswordResetRequestDto, {
        email: 'invalid-email',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });
  });

  describe('PasswordResetConfirmDto', () => {
    it('should validate token and valid newPassword', async () => {
      const dto = plainToInstance(PasswordResetConfirmDto, {
        token: 'reset-token-abc',
        newPassword: 'BrandNewPassword123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when newPassword is less than 8 characters', async () => {
      const dto = plainToInstance(PasswordResetConfirmDto, {
        token: 'reset-token-abc',
        newPassword: 'short',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'newPassword')).toBe(true);
    });

    it('should fail when token is missing', async () => {
      const dto = plainToInstance(PasswordResetConfirmDto, {
        newPassword: 'BrandNewPassword123',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'token')).toBe(true);
    });
  });

  describe('OtpSendDto', () => {
    it('should validate email', async () => {
      const dto = plainToInstance(OtpSendDto, {
        email: 'otp@example.com',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when email is missing or invalid', async () => {
      const dto = plainToInstance(OtpSendDto, { email: 'bad' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });
  });

  describe('OtpVerifyDto', () => {
    it('should validate valid email and exact 6-digit code', async () => {
      const dto = plainToInstance(OtpVerifyDto, {
        email: 'otp@example.com',
        code: '123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when code length is not 6 characters', async () => {
      const tooShort = plainToInstance(OtpVerifyDto, { email: 'otp@example.com', code: '12345' });
      const tooLong = plainToInstance(OtpVerifyDto, { email: 'otp@example.com', code: '1234567' });

      const errorsShort = await validate(tooShort);
      const errorsLong = await validate(tooLong);

      expect(errorsShort.some((e) => e.property === 'code')).toBe(true);
      expect(errorsLong.some((e) => e.property === 'code')).toBe(true);
    });
  });

  describe('TotpSetupDto', () => {
    it('should validate 6-digit verification code and optional secret', async () => {
      const dto = plainToInstance(TotpSetupDto, {
        code: '654321',
        secret: 'JBSWY3DPEHPK3PXP',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when code is missing or not 6 characters', async () => {
      const dto = plainToInstance(TotpSetupDto, { code: '12' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'code')).toBe(true);
    });
  });

  describe('TotpVerifyDto', () => {
    it('should validate 6-digit code with optional tempToken or userId', async () => {
      const dto = plainToInstance(TotpVerifyDto, {
        code: '987654',
        tempToken: 'temp-auth-jwt-token',
        userId: 'user-uuid-123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when code is missing or invalid length', async () => {
      const dto = plainToInstance(TotpVerifyDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'code')).toBe(true);
    });
  });

  describe('RefreshDto', () => {
    it('should validate refresh_token', async () => {
      const dto = plainToInstance(RefreshDto, {
        refresh_token: 'valid-refresh-token',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when refresh_token is missing', async () => {
      const dto = plainToInstance(RefreshDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'refresh_token')).toBe(true);
    });
  });
});
