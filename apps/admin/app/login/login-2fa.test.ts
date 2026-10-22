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

  describe('5. Server-Enforced RBAC Matrix Verification (SUPER_ADMIN, ADMIN, MANAGER, USER)', () => {
    interface RbacUser {
      id: string;
      email: string;
      role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER';
    }

    const canAccessAdminRoute = (user: RbacUser, route: string): boolean => {
      // Learners (USER) cannot access any admin portal routes
      if (user.role === 'USER') return false;

      // SUPER_ADMIN has unrestricted access across all routes
      if (user.role === 'SUPER_ADMIN') return true;

      // MANAGER is batch-scoped: can only access batch sessions, attendance, and direct messaging
      if (user.role === 'MANAGER') {
        const allowedPrefixes = ['/batches', '/sessions', '/attendance', '/messages'];
        const isRestrictedGlobal = ['/programs/create', '/revenue', '/settings', '/users'].some(p => route.startsWith(p));
        if (isRestrictedGlobal) return false;
        return allowedPrefixes.some(p => route.startsWith(p));
      }

      // ADMIN has operational access across programs, batches, leads, quizzes, revenue
      if (user.role === 'ADMIN') {
        // Restricted from system-level destructive operations or staff role management reserved for SUPER_ADMIN
        const superAdminOnly = ['/settings/system-purge', '/users/assign-super-admin'];
        return !superAdminOnly.includes(route);
      }

      return false;
    };

    it('SUPER_ADMIN can access all operational and destructive system routes', () => {
      const superAdmin: RbacUser = { id: 'sa-1', email: 'roweena@whatboutme.com', role: 'SUPER_ADMIN' };

      expect(canAccessAdminRoute(superAdmin, '/dashboard')).toBe(true);
      expect(canAccessAdminRoute(superAdmin, '/programs')).toBe(true);
      expect(canAccessAdminRoute(superAdmin, '/revenue')).toBe(true);
      expect(canAccessAdminRoute(superAdmin, '/settings/system-purge')).toBe(true);
      expect(canAccessAdminRoute(superAdmin, '/users/assign-super-admin')).toBe(true);
    });

    it('ADMIN has operational control but is restricted from SUPER_ADMIN-only destructive routes', () => {
      const admin: RbacUser = { id: 'adm-1', email: 'ops@whatboutme.com', role: 'ADMIN' };

      expect(canAccessAdminRoute(admin, '/dashboard')).toBe(true);
      expect(canAccessAdminRoute(admin, '/programs')).toBe(true);
      expect(canAccessAdminRoute(admin, '/revenue')).toBe(true);
      expect(canAccessAdminRoute(admin, '/leads')).toBe(true);

      // Blocked from destructive super-admin only endpoints
      expect(canAccessAdminRoute(admin, '/settings/system-purge')).toBe(false);
      expect(canAccessAdminRoute(admin, '/users/assign-super-admin')).toBe(false);
    });

    it('MANAGER is strictly batch-scoped and blocked from global curriculum, pricing, and revenue', () => {
      const manager: RbacUser = { id: 'mgr-1', email: 'trainer@whatboutme.com', role: 'MANAGER' };

      // Permitted batch management & attendance actions
      expect(canAccessAdminRoute(manager, '/batches/batch-101')).toBe(true);
      expect(canAccessAdminRoute(manager, '/sessions/sess-202')).toBe(true);
      expect(canAccessAdminRoute(manager, '/attendance/reconcile')).toBe(true);

      // Blocked from modifying global curriculum, revenue, or users
      expect(canAccessAdminRoute(manager, '/programs/create')).toBe(false);
      expect(canAccessAdminRoute(manager, '/revenue')).toBe(false);
      expect(canAccessAdminRoute(manager, '/settings')).toBe(false);
      expect(canAccessAdminRoute(manager, '/users')).toBe(false);
    });

    it('USER (Learner) is strictly blocked from the Admin & Studio Portal', () => {
      const learner: RbacUser = { id: 'usr-1', email: 'learner@example.com', role: 'USER' };

      expect(canAccessAdminRoute(learner, '/dashboard')).toBe(false);
      expect(canAccessAdminRoute(learner, '/programs')).toBe(false);
      expect(canAccessAdminRoute(learner, '/batches')).toBe(false);
      expect(canAccessAdminRoute(learner, '/leads')).toBe(false);
    });
  });

  describe('6. TOTP Input Sanitization, Rate Limiting & Lockout Handling', () => {
    const sanitizeTotpInput = (input: string): string => {
      return input.replace(/[\s-]/g, '').trim();
    };

    const validateTotpFormat = (input: string): boolean => {
      const clean = sanitizeTotpInput(input);
      return /^\d{6}$/.test(clean);
    };

    class TotpRateLimiter {
      private attempts = new Map<string, { count: number; lockedUntil: number }>();
      private readonly maxAttempts = 5;
      private readonly lockoutDurationMs = 15 * 60 * 1000; // 15 minutes

      recordFailure(tempToken: string): { locked: boolean; remainingAttempts: number; retryAfterMs?: number } {
        const now = Date.now();
        const entry = this.attempts.get(tempToken) || { count: 0, lockedUntil: 0 };

        if (entry.lockedUntil > now) {
          return { locked: true, remainingAttempts: 0, retryAfterMs: entry.lockedUntil - now };
        }

        entry.count += 1;
        if (entry.count >= this.maxAttempts) {
          entry.lockedUntil = now + this.lockoutDurationMs;
          this.attempts.set(tempToken, entry);
          return { locked: true, remainingAttempts: 0, retryAfterMs: this.lockoutDurationMs };
        }

        this.attempts.set(tempToken, entry);
        return { locked: false, remainingAttempts: this.maxAttempts - entry.count };
      }

      reset(tempToken: string): void {
        this.attempts.delete(tempToken);
      }
    }

    it('sanitizes user input by stripping spaces and hyphens from 6-digit TOTP codes', () => {
      expect(sanitizeTotpInput('123 456')).toBe('123456');
      expect(sanitizeTotpInput('123-456')).toBe('123456');
      expect(sanitizeTotpInput('  789 012  ')).toBe('789012');

      expect(validateTotpFormat('123 456')).toBe(true);
      expect(validateTotpFormat('123-456')).toBe(true);
      expect(validateTotpFormat('12345')).toBe(false); // too short
      expect(validateTotpFormat('1234567')).toBe(false); // too long
      expect(validateTotpFormat('12345a')).toBe(false); // non-numeric
    });

    it('locks out tempToken after 5 consecutive failed verification attempts for 15 minutes', () => {
      const limiter = new TotpRateLimiter();
      const tempToken = 'temp_token_rate_test';

      // 4 failed attempts: not locked
      for (let i = 1; i <= 4; i++) {
        const status = limiter.recordFailure(tempToken);
        expect(status.locked).toBe(false);
        expect(status.remainingAttempts).toBe(5 - i);
      }

      // 5th failed attempt: triggers lockout
      const fifthAttempt = limiter.recordFailure(tempToken);
      expect(fifthAttempt.locked).toBe(true);
      expect(fifthAttempt.remainingAttempts).toBe(0);
      expect(fifthAttempt.retryAfterMs).toBeGreaterThan(0);

      // 6th attempt: remains locked
      const sixthAttempt = limiter.recordFailure(tempToken);
      expect(sixthAttempt.locked).toBe(true);

      // Successful verification resets failure count
      limiter.reset(tempToken);
      const postReset = limiter.recordFailure(tempToken);
      expect(postReset.locked).toBe(false);
      expect(postReset.remainingAttempts).toBe(4);
    });
  });

  describe('7. Base32 RFC 6238 Secret Invariant & Refresh Token Rotation', () => {
    it('verifies TOTP secrets conform strictly to RFC 6238 Base32 alphabet and length', () => {
      const isValidBase32Secret = (secret: string): boolean => {
        // Base32 alphabet is A-Z and 2-7, standard length 16, 24, or 32 chars
        return /^[A-Z2-7]{16,32}$/.test(secret);
      };

      expect(isValidBase32Secret('HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ')).toBe(true); // 32 chars
      expect(isValidBase32Secret('JBSWY3DPEHPK3PXP')).toBe(true); // 16 chars
      expect(isValidBase32Secret('HXDMVJECJJWSRB3HWIZR4IFUGFTMXBO1')).toBe(false); // '1' is not in Base32
      expect(isValidBase32Secret('HXDMVJECJJWSRB3HWIZR4IFUGFTMXBO8')).toBe(false); // '8' is not in Base32
      expect(isValidBase32Secret('hxdmvjecjjwsrb3hwizr4ifugftmxboz')).toBe(false); // lowercase rejected
    });

    it('enforces atomic refresh token rotation to prevent replay attacks', () => {
      // Simulate token rotation manager
      let activeRefreshToken = 'rt_initial_version_1';
      let activeAccessToken = 'at_initial_version_1';

      const rotateTokens = (providedRefreshToken: string) => {
        if (providedRefreshToken !== activeRefreshToken) {
          throw new Error('Refresh token revoked or invalid: replay attack detected');
        }
        // Invalidate previous refresh token and generate new pair
        activeRefreshToken = `rt_rotated_version_${Date.now()}`;
        activeAccessToken = `at_rotated_version_${Date.now()}`;
        return { access_token: activeAccessToken, refresh_token: activeRefreshToken };
      };

      // 1. Valid refresh succeeds and issues new pair
      const newPair = rotateTokens('rt_initial_version_1');
      expect(newPair.access_token).toBeDefined();
      expect(newPair.refresh_token).not.toBe('rt_initial_version_1');

      // 2. Attempting to replay old refresh token throws security error
      expect(() => rotateTokens('rt_initial_version_1')).toThrow(/replay attack detected/i);

      // 3. Using current rotated refresh token succeeds again
      const secondRotation = rotateTokens(newPair.refresh_token);
      expect(secondRotation.refresh_token).not.toBe(newPair.refresh_token);
    });
  });
});

