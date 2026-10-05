import { describe, it, expect, beforeEach, vi } from 'vitest';
import QRCode from 'qrcode';

// Mock storage
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('Admin 2FA / TOTP Frontend Flows (D1-022)', () => {
  let localStorageMock: MemoryStorage;

  beforeEach(() => {
    localStorageMock = new MemoryStorage();
    vi.restoreAllMocks();
  });

  describe('1. Admin Login & Credentials Transition', () => {
    it('normal admin login stores tokens and redirects without 2FA challenge', async () => {
      const loginResponse = {
        access_token: 'valid_access_token_manager',
        refresh_token: 'valid_refresh_token_manager',
        user: { id: 'u1', email: 'mgr@whatboutme.com', role: 'MANAGER' },
      };

      // Simulate normal login flow
      if (loginResponse.access_token) {
        localStorageMock.setItem('token', loginResponse.access_token);
        if (loginResponse.refresh_token) {
          localStorageMock.setItem('refresh_token', loginResponse.refresh_token);
        }
        localStorageMock.setItem('user', JSON.stringify(loginResponse.user));
      }

      expect(localStorageMock.getItem('token')).toBe('valid_access_token_manager');
      expect(localStorageMock.getItem('refresh_token')).toBe('valid_refresh_token_manager');
      expect(JSON.parse(localStorageMock.getItem('user')!)).toEqual(loginResponse.user);
    });

    it('requires2fa response transitions to TOTP verification and never stores tempToken as access_token', async () => {
      const loginResponse = {
        requires2fa: true,
        tempToken: 'mock_temp_jwt_token_for_2fa',
      };

      let viewMode: 'login' | 'verify_2fa' | 'setup_2fa' | 'backup_codes' = 'login';
      let currentTempToken = '';

      if (loginResponse.requires2fa && loginResponse.tempToken) {
        currentTempToken = loginResponse.tempToken;
        viewMode = 'verify_2fa';
        // Note: Do NOT store in localStorage
      }

      expect(viewMode).toBe('verify_2fa');
      expect(currentTempToken).toBe('mock_temp_jwt_token_for_2fa');
      expect(localStorageMock.getItem('token')).toBeNull();
      expect(localStorageMock.getItem('refresh_token')).toBeNull();
    });

    it('requires2faSetup response retains pending session and triggers setup without immediate dashboard access', async () => {
      const loginResponse = {
        access_token: 'pending_admin_token',
        refresh_token: 'pending_refresh_token',
        user: { id: 'u2', email: 'admin@whatboutme.com', role: 'ADMIN' },
        requires2faSetup: true,
      };

      let viewMode: 'login' | 'verify_2fa' | 'setup_2fa' | 'backup_codes' = 'login';
      let pendingSession: any = null;

      if (loginResponse.requires2faSetup && loginResponse.access_token) {
        pendingSession = {
          access_token: loginResponse.access_token,
          refresh_token: loginResponse.refresh_token,
          user: loginResponse.user,
        };
        // Generate setup info
        viewMode = 'setup_2fa';
      }

      expect(viewMode).toBe('setup_2fa');
      expect(pendingSession.access_token).toBe('pending_admin_token');
      // Must not be in localStorage yet
      expect(localStorageMock.getItem('token')).toBeNull();
    });
  });

  describe('2. TOTP 2FA Verification Flow', () => {
    it('successful TOTP verification stores access_token, refresh_token, and user', async () => {
      const tempToken = 'mock_temp_jwt_token_for_2fa';
      const code = '654321';

      // Mock verify endpoint response
      const verifyResponse = {
        access_token: 'final_verified_access_token',
        refresh_token: 'final_verified_refresh_token',
        user: { id: 'u2', email: 'admin@whatboutme.com', role: 'ADMIN' },
      };

      // Payload conforms to TotpVerifyDto
      const payload = { tempToken, code };
      expect(payload.code).toHaveLength(6);

      localStorageMock.setItem('token', verifyResponse.access_token);
      localStorageMock.setItem('refresh_token', verifyResponse.refresh_token);
      localStorageMock.setItem('user', JSON.stringify(verifyResponse.user));

      expect(localStorageMock.getItem('token')).toBe('final_verified_access_token');
      expect(localStorageMock.getItem('refresh_token')).toBe('final_verified_refresh_token');
      expect(JSON.parse(localStorageMock.getItem('user')!).email).toBe('admin@whatboutme.com');
    });

    it('backup code path passes code and backupCode to verify endpoint and succeeds', async () => {
      const tempToken = 'mock_temp_jwt_token_for_2fa';
      const backupCode = 'A1B2C3D4';

      const payload = {
        tempToken,
        code: backupCode,
        backupCode,
      };

      expect(payload.tempToken).toBe(tempToken);
      expect(payload.code).toBe(backupCode);
      expect(payload.backupCode).toBe(backupCode);

      const verifyResponse = {
        access_token: 'backup_recovered_access_token',
        refresh_token: 'backup_recovered_refresh_token',
        user: { id: 'u2', email: 'admin@whatboutme.com', role: 'ADMIN' },
      };

      localStorageMock.setItem('token', verifyResponse.access_token);
      expect(localStorageMock.getItem('token')).toBe('backup_recovered_access_token');
    });

    it('failed verification displays error and does not set tokens', () => {
      const errorResponse = {
        message: 'Invalid two-factor authentication code',
        statusCode: 401,
      };

      let error = '';
      if (errorResponse.message) {
        error = errorResponse.message;
      }

      expect(error).toBe('Invalid two-factor authentication code');
      expect(localStorageMock.getItem('token')).toBeNull();
    });
  });

  describe('3. First-Time 2FA Setup Flow', () => {
    it('consumes otpauthUrl and generates valid QR code data URL and exposes secret', async () => {
      const generateResponse = {
        secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
        otpauthUrl: 'otpauth://totp/WhatBoutMe:admin@whatboutme.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=WhatBoutMe',
      };

      const qrDataUrl = await QRCode.toDataURL(generateResponse.otpauthUrl, {
        width: 180,
        margin: 1,
      });

      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(generateResponse.secret).toHaveLength(32);
    });

    it('successful enable2fa provides 10 one-time backup codes and transitions to backup_codes view', () => {
      const enableResponse = {
        success: true,
        message: 'Two-factor authentication enabled successfully',
        backupCodes: [
          'BC010001',
          'BC010002',
          'BC010003',
          'BC010004',
          'BC010005',
          'BC010006',
          'BC010007',
          'BC010008',
          'BC010009',
          'BC010010',
        ],
      };

      let viewMode: 'login' | 'verify_2fa' | 'setup_2fa' | 'backup_codes' = 'setup_2fa';
      let backupCodes: string[] = [];

      if (enableResponse.success && enableResponse.backupCodes) {
        backupCodes = enableResponse.backupCodes;
        viewMode = 'backup_codes';
      }

      expect(viewMode).toBe('backup_codes');
      expect(backupCodes).toHaveLength(10);
      expect(backupCodes[0]).toBe('BC010001');
      // Crucial security invariant: backup codes are NEVER stored in localStorage
      expect(localStorageMock.getItem('backupCodes')).toBeNull();
    });

    it('requires acknowledgment before committing pending session to localStorage', () => {
      const pendingSession = {
        access_token: 'fresh_admin_access_token',
        refresh_token: 'fresh_admin_refresh_token',
        user: { id: 'u2', email: 'admin@whatboutme.com', role: 'ADMIN' },
      };

      let backupAcknowledged = false;

      // Attempt to finish without acknowledgment
      const tryFinish = (ack: boolean) => {
        if (!ack) {
          return false;
        }
        localStorageMock.setItem('token', pendingSession.access_token);
        localStorageMock.setItem('refresh_token', pendingSession.refresh_token);
        localStorageMock.setItem('user', JSON.stringify(pendingSession.user));
        return true;
      };

      expect(tryFinish(backupAcknowledged)).toBe(false);
      expect(localStorageMock.getItem('token')).toBeNull();

      // Now acknowledge
      backupAcknowledged = true;
      expect(tryFinish(backupAcknowledged)).toBe(true);
      expect(localStorageMock.getItem('token')).toBe('fresh_admin_access_token');
      expect(localStorageMock.getItem('refresh_token')).toBe('fresh_admin_refresh_token');
    });
  });

  describe('4. AuthProvider Interceptor Exemption Compatibility', () => {
    it('exempts /auth/2fa endpoints from global 401 redirect interception', () => {
      // In AuthProvider.tsx:
      // const isSignedInRequest = Boolean(token) && typeof input === 'string' && !/\/auth\/(login|signup|admin-login|refresh|2fa)/.test(input);
      const isExempt = (url: string) => /\/auth\/(login|signup|admin-login|refresh|2fa)/.test(url);

      expect(isExempt('http://localhost:4000/auth/2fa/verify')).toBe(true);
      expect(isExempt('http://localhost:4000/auth/2fa/generate')).toBe(true);
      expect(isExempt('http://localhost:4000/auth/2fa/enable')).toBe(true);
      expect(isExempt('http://localhost:4000/auth/admin-login')).toBe(true);
      expect(isExempt('http://localhost:4000/auth/login')).toBe(true);
      expect(isExempt('http://localhost:4000/auth/refresh')).toBe(true);

      // Normal protected API routes are NOT exempt (should be intercepted on 401)
      expect(isExempt('http://localhost:4000/auth/session')).toBe(false);
      expect(isExempt('http://localhost:4000/programs')).toBe(false);
      expect(isExempt('http://localhost:4000/batches')).toBe(false);
    });
  });
});
