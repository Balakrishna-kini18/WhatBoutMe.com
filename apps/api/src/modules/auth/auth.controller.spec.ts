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
      requestPasswordReset: vi.fn(),
      confirmPasswordReset: vi.fn(),
      generate2faSecret: vi.fn(),
      enable2fa: vi.fn(),
      verify2fa: vi.fn(),
      logout: vi.fn(),
      logoutAll: vi.fn(),
      getSessions: vi.fn(),
      revokeSession: vi.fn(),
      checkSession: vi.fn(),
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
        country: null,
      });
      expect(res).toHaveProperty('access_token');
    });

    it('calls authService.login with phone when email is omitted and extracts cf-ipcountry', async () => {
      authServiceMock.login.mockResolvedValue({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        user: { id: 'u2', phone: '+15551234567' },
      });

      const req = {
        ip: '1.2.3.4',
        headers: {
          'user-agent': 'Mobile-Safari',
          'x-device-fingerprint': 'fp-phone-1',
          'cf-ipcountry': 'AE',
        },
      };

      const res = await controller.login(
        {
          phone: '+15551234567',
          password: 'Password123!',
        },
        req,
      );

      expect(authServiceMock.login).toHaveBeenCalledWith('+15551234567', 'Password123!', {
        ipAddress: '1.2.3.4',
        userAgent: 'Mobile-Safari',
        deviceFingerprint: 'fp-phone-1',
        country: 'AE',
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

  describe('AuthController - Password Reset Endpoints (D1-021)', () => {
    it('POST /auth/password-reset/request calls authService.requestPasswordReset with email', async () => {
      authServiceMock.requestPasswordReset.mockResolvedValue({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });

      const res = await controller.requestPasswordReset({
        email: 'user@example.com',
      });

      expect(authServiceMock.requestPasswordReset).toHaveBeenCalledWith('user@example.com');
      expect(res).toEqual({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    });

    it('POST /auth/password-reset/confirm calls authService.confirmPasswordReset with token and newPassword', async () => {
      authServiceMock.confirmPasswordReset.mockResolvedValue({
        success: true,
        message: 'Password has been reset successfully',
      });

      const res = await controller.confirmPasswordReset({
        token: 'valid-reset-token',
        newPassword: 'BrandNewSecurePassword123!',
      });

      expect(authServiceMock.confirmPasswordReset).toHaveBeenCalledWith(
        'valid-reset-token',
        'BrandNewSecurePassword123!',
      );
      expect(res).toEqual({
        success: true,
        message: 'Password has been reset successfully',
      });
    });
  });

  describe('AuthController - 2FA Endpoints (D1-022)', () => {
    it('POST /auth/admin-login extracts IP, User-Agent, device fingerprint, and country', async () => {
      authServiceMock.adminLogin.mockResolvedValue({
        requires2fa: true,
        tempToken: 'temp-jwt-token',
      });

      const req = {
        ip: '192.168.1.50',
        headers: {
          'user-agent': 'Vitest-Admin-Browser',
          'x-device-fingerprint': 'fp-admin-123',
          'x-country-code': 'US',
        },
      };

      const res = await controller.adminLogin(
        { email: 'admin@whatboutme.com', password: 'AdminPassword123!' },
        req,
      );

      expect(authServiceMock.adminLogin).toHaveBeenCalledWith(
        'admin@whatboutme.com',
        'AdminPassword123!',
        {
          ipAddress: '192.168.1.50',
          userAgent: 'Vitest-Admin-Browser',
          deviceFingerprint: 'fp-admin-123',
          country: 'US',
        },
      );
      expect(res).toEqual({
        requires2fa: true,
        tempToken: 'temp-jwt-token',
      });
    });

    it('POST /auth/2fa/generate calls authService.generate2faSecret with req.user.sub', async () => {
      authServiceMock.generate2faSecret.mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/WhatBoutMe:admin@whatboutme.com?secret=JBSWY3DPEHPK3PXP&issuer=WhatBoutMe',
      });

      const req = { user: { sub: 'admin-uuid-1', role: 'ADMIN' } };
      const res = await controller.generate2fa(req);

      expect(authServiceMock.generate2faSecret).toHaveBeenCalledWith('admin-uuid-1');
      expect(res).toHaveProperty('secret', 'JBSWY3DPEHPK3PXP');
      expect(res).toHaveProperty('otpauthUrl');
    });

    it('POST /auth/2fa/enable calls authService.enable2fa with req.user.sub, code, and secret', async () => {
      authServiceMock.enable2fa.mockResolvedValue({
        success: true,
        message: 'Two-factor authentication enabled successfully',
        backupCodes: ['CODE1', 'CODE2'],
      });

      const req = { user: { sub: 'admin-uuid-1', role: 'ADMIN' } };
      const body = { code: '123456', secret: 'JBSWY3DPEHPK3PXP' };
      const res = await controller.enable2fa(body, req);

      expect(authServiceMock.enable2fa).toHaveBeenCalledWith('admin-uuid-1', '123456', 'JBSWY3DPEHPK3PXP');
      expect(res.success).toBe(true);
      expect(res.backupCodes).toHaveLength(2);
    });

    it('POST /auth/2fa/verify calls authService.verify2fa with tempToken and code from body', async () => {
      authServiceMock.verify2fa.mockResolvedValue({
        access_token: 'normal-access-token',
        refresh_token: 'normal-refresh-token',
        user: { id: 'admin-uuid-1', email: 'admin@whatboutme.com' },
      });

      const body = {
        code: '654321',
        tempToken: 'temp-token-from-body',
      };
      const req = {
        ip: '10.0.0.1',
        headers: {
          'user-agent': 'Chrome/120',
          'x-device-fingerprint': 'fp-test',
        },
      };

      const res = await controller.verify2fa(body, req);

      expect(authServiceMock.verify2fa).toHaveBeenCalledWith('temp-token-from-body', '654321', {
        ipAddress: '10.0.0.1',
        userAgent: 'Chrome/120',
        deviceFingerprint: 'fp-test',
        country: null,
      });
      expect(res).toHaveProperty('access_token');
    });

    it('POST /auth/2fa/verify extracts tempToken from Authorization header if not in body', async () => {
      authServiceMock.verify2fa.mockResolvedValue({
        access_token: 'normal-access-token',
        refresh_token: 'normal-refresh-token',
      });

      const body = { code: '123456' };
      const req = {
        headers: {
          authorization: 'Bearer auth-header-temp-token',
        },
      };

      const res = await controller.verify2fa(body, req);

      expect(authServiceMock.verify2fa).toHaveBeenCalledWith('auth-header-temp-token', '123456', {
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
        country: null,
      });
      expect(res).toHaveProperty('access_token');
    });

    it('POST /auth/2fa/verify accepts backupCode in body when code is also supplied or used', async () => {
      authServiceMock.verify2fa.mockResolvedValue({
        access_token: 'normal-access-token',
        refresh_token: 'normal-refresh-token',
      });

      const body = {
        code: 'A1B2C3D4',
        backupCode: 'A1B2C3D4',
        tempToken: 'temp-token-xyz',
      };

      const res = await controller.verify2fa(body);

      expect(authServiceMock.verify2fa).toHaveBeenCalledWith('temp-token-xyz', 'A1B2C3D4', {
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
        country: null,
      });
      expect(res).toHaveProperty('access_token');
    });
  });

  describe('AuthController - Logout & Session Management Endpoints (D1-023)', () => {
    it('POST /auth/logout calls authService.logout with req.user.sub and req.user.sessionId', async () => {
      authServiceMock.logout.mockResolvedValue({
        success: true,
        message: 'Logged out successfully',
      });

      const req = { user: { sub: 'user-uuid-1', sessionId: 'sess-uuid-1' } };
      const res = await controller.logout(req);

      expect(authServiceMock.logout).toHaveBeenCalledWith('user-uuid-1', 'sess-uuid-1');
      expect(res).toEqual({
        success: true,
        message: 'Logged out successfully',
      });
    });

    it('POST /auth/logout-all calls authService.logoutAll with req.user.sub', async () => {
      authServiceMock.logoutAll.mockResolvedValue({
        success: true,
        count: 3,
        message: 'All sessions logged out successfully',
      });

      const req = { user: { sub: 'user-uuid-1' } };
      const res = await controller.logoutAll(req);

      expect(authServiceMock.logoutAll).toHaveBeenCalledWith('user-uuid-1');
      expect(res).toEqual({
        success: true,
        count: 3,
        message: 'All sessions logged out successfully',
      });
    });

    it('GET /auth/sessions calls authService.getSessions with req.user.sub and req.user.sessionId', async () => {
      const mockSessions = [
        {
          id: 'sess-1',
          deviceFingerprint: 'fp-1',
          ipAddress: '127.0.0.1',
          userAgent: 'Chrome',
          lastActive: new Date(),
          expiresAt: null,
          createdAt: new Date(),
          isCurrent: true,
        },
      ];
      authServiceMock.getSessions.mockResolvedValue(mockSessions);

      const req = { user: { sub: 'user-uuid-1', sessionId: 'sess-1' } };
      const res = await controller.getSessions(req);

      expect(authServiceMock.getSessions).toHaveBeenCalledWith('user-uuid-1', 'sess-1');
      expect(res).toEqual(mockSessions);
    });

    it('DELETE /auth/sessions/:id calls authService.revokeSession with req.user.sub, id, and req.user.sessionId', async () => {
      authServiceMock.revokeSession.mockResolvedValue({
        success: true,
        message: 'Session revoked successfully',
        isCurrent: false,
      });

      const req = { user: { sub: 'user-uuid-1', sessionId: 'sess-1' } };
      const res = await controller.revokeSession('sess-2', req);

      expect(authServiceMock.revokeSession).toHaveBeenCalledWith('user-uuid-1', 'sess-2', 'sess-1');
      expect(res).toEqual({
        success: true,
        message: 'Session revoked successfully',
        isCurrent: false,
      });
    });

    it('POST /auth/sessions/:id/revoke calls authService.revokeSession as POST alternative', async () => {
      authServiceMock.revokeSession.mockResolvedValue({
        success: true,
        message: 'Session revoked successfully',
        isCurrent: true,
      });

      const req = { user: { sub: 'user-uuid-1', sessionId: 'sess-1' } };
      const res = await controller.revokeSessionPost('sess-1', req);

      expect(authServiceMock.revokeSession).toHaveBeenCalledWith('user-uuid-1', 'sess-1', 'sess-1');
      expect(res).toEqual({
        success: true,
        message: 'Session revoked successfully',
        isCurrent: true,
      });
    });
  });
});
