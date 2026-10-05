import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationDto } from './dto/index.js';

describe('AuthController - Email Verification Endpoints (D1-015)', () => {
  let controller: AuthController;
  let authServiceMock: Partial<Record<keyof AuthService, any>>;

  beforeEach(() => {
    authServiceMock = {
      login: vi.fn(),
      signup: vi.fn(),
      adminLogin: vi.fn(),
      refreshToken: vi.fn(),
      verifyEmail: vi.fn(),
    };

    controller = new AuthController(authServiceMock as AuthService);
  });

  it('POST /auth/verify-email calls authService.verifyEmail with token from body', async () => {
    authServiceMock.verifyEmail.mockResolvedValue({
      success: true,
      message: 'Email verified successfully',
    });

    const body: EmailVerificationDto = { token: 'mock-post-token-123' };
    const res = await controller.verifyEmail(body);

    expect(authServiceMock.verifyEmail).toHaveBeenCalledWith('mock-post-token-123');
    expect(res).toEqual({
      success: true,
      message: 'Email verified successfully',
    });
  });

  it('GET /auth/verify-email calls authService.verifyEmail with token from query', async () => {
    authServiceMock.verifyEmail.mockResolvedValue({
      success: true,
      message: 'Email verified successfully',
    });

    const query: EmailVerificationDto = { token: 'mock-get-token-456' };
    const res = await controller.verifyEmailGet(query);

    expect(authServiceMock.verifyEmail).toHaveBeenCalledWith('mock-get-token-456');
    expect(res).toEqual({
      success: true,
      message: 'Email verified successfully',
    });
  });

  describe('POST /auth/login', () => {
    it('calls authService.login with email and password', async () => {
      authServiceMock.login.mockResolvedValue({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        user: { id: 'u1', email: 'test@example.com' },
      });

      const res = await controller.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(authServiceMock.login).toHaveBeenCalledWith('test@example.com', 'Password123!', {
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
      });
      expect(res).toHaveProperty('access_token');
    });

    it('calls authService.login with phone when email is omitted', async () => {
      authServiceMock.login.mockResolvedValue({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        user: { id: 'u2', phone: '+15551234567' },
      });

      const res = await controller.login({
        phone: '+15551234567',
        password: 'Password123!',
      });

      expect(authServiceMock.login).toHaveBeenCalledWith('+15551234567', 'Password123!', {
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
      });
      expect(res).toHaveProperty('access_token');
    });
  });

  describe('AuthController - Refresh Endpoint (D1-018)', () => {
    it('calls authService.refreshToken with body.refresh_token', async () => {
      authServiceMock.refreshToken.mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });

      const res = await controller.refreshToken({
        refresh_token: 'valid-refresh-token',
      });

      expect(authServiceMock.refreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(res).toEqual({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });
    });
  });
});
