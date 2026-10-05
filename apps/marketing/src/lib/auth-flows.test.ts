import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signupUser, verifyEmailUser, requestPasswordResetUser, confirmPasswordResetUser } from './api';
import { signUp, signIn, signOut } from './auth';

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

describe('Marketing Authentication & Recovery Flows (P1 - P3)', () => {
  let localStorageMock: MemoryStorage;
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    localStorageMock = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { hostname: 'localhost', search: '' },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  describe('P1: Marketing Signup Contract', () => {
    it('signupUser submits country, timezone, phone, email, name, and password to POST /auth/signup', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: {
              id: 'user-123',
              email: 'learner@example.com',
              name: 'Jane Learner',
              role: 'LEARNER',
              country: 'United Arab Emirates',
              timezone: 'Asia/Dubai',
            },
          }),
        };
      });

      const details = {
        name: 'Jane Learner',
        email: 'learner@example.com',
        phone: '+971501234567',
        country: 'United Arab Emirates',
        timezone: 'Asia/Dubai',
        password: 'Password123!',
      };

      const result = await signupUser(details);

      expect(capturedUrl).toContain('/auth/signup');
      expect(capturedBody).toEqual(details);
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('learner@example.com');
      expect(result.user.country).toBe('United Arab Emirates');
      expect(result.user.timezone).toBe('Asia/Dubai');
    });

    it('signUp flow does NOT store session tokens in localStorage or trigger login session event', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 201,
        json: async () => ({
          user: {
            id: 'user-456',
            email: 'newbie@example.com',
            name: 'Newbie',
            role: 'LEARNER',
          },
        }),
      }));

      const res = await signUp({
        name: 'Newbie',
        email: 'newbie@example.com',
        password: 'Password123!',
        country: 'India',
        timezone: 'Asia/Kolkata',
      });

      expect(res.user.id).toBe('user-456');
      expect(localStorageMock.getItem('wbm_token')).toBeNull();
      expect(localStorageMock.getItem('wbm_refresh_token')).toBeNull();
      expect(localStorageMock.getItem('wbm_user')).toBeNull();
    });

    it('signIn flow still properly stores tokens and user in localStorage', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'acc_token_123',
          refresh_token: 'ref_token_123',
          user: {
            id: 'user-456',
            email: 'newbie@example.com',
            name: 'Newbie',
            role: 'LEARNER',
          },
        }),
      }));

      await signIn('newbie@example.com', 'Password123!');

      expect(localStorageMock.getItem('wbm_token')).toBe('acc_token_123');
      expect(localStorageMock.getItem('wbm_refresh_token')).toBe('ref_token_123');
      expect(JSON.parse(localStorageMock.getItem('wbm_user')!).email).toBe('newbie@example.com');
    });
  });

  describe('P2: Marketing Email Verification', () => {
    it('verifyEmailUser calls GET /auth/verify-email with encoded token and returns success', async () => {
      let capturedUrl = '';
      let capturedMethod = '';

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedMethod = init?.method || 'GET';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            message: 'Email verified successfully',
          }),
        };
      });

      const token = 'sample_raw_verification_token_abc123';
      const result = await verifyEmailUser(token);

      expect(capturedUrl).toContain(`/auth/verify-email?token=${encodeURIComponent(token)}`);
      expect(capturedMethod).toBe('GET');
      expect(result.success).toBe(true);
    });

    it('verifyEmailUser handles invalid or expired token error from backend', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'INVALID_TOKEN',
            message: 'Verification token has expired or is invalid.',
          },
        }),
      }));

      await expect(verifyEmailUser('expired_token')).rejects.toThrow(
        'Verification token has expired or is invalid.',
      );
    });
  });

  describe('P3: Marketing Password Recovery', () => {
    it('requestPasswordResetUser sends trimmed, lowercased email to POST /auth/password-reset/request', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            message: 'If an account exists with this email, a reset link has been sent.',
          }),
        };
      });

      const res = await requestPasswordResetUser('  Learner@Example.COM  ');

      expect(capturedUrl).toContain('/auth/password-reset/request');
      expect(capturedBody).toEqual({ email: 'learner@example.com' });
      expect(res.success).toBe(true);
    });

    it('confirmPasswordResetUser sends token and newPassword to POST /auth/password-reset/confirm', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            message: 'Password reset successfully. You may now log in with your new password.',
          }),
        };
      });

      const token = 'reset_token_xyz789';
      const newPassword = 'NewStrongPassword2026!';
      const res = await confirmPasswordResetUser(token, newPassword);

      expect(capturedUrl).toContain('/auth/password-reset/confirm');
      expect(capturedBody).toEqual({ token, newPassword });
      expect(res.success).toBe(true);
    });

    it('confirmPasswordResetUser handles expired reset token failure', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'INVALID_RESET_TOKEN',
            message: 'Reset token is invalid or has expired.',
          },
        }),
      }));

      await expect(
        confirmPasswordResetUser('expired_token', 'NewStrongPassword2026!'),
      ).rejects.toThrow('Reset token is invalid or has expired.');
    });
  });
});
