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
});
