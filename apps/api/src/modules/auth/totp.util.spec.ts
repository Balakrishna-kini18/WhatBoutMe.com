import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  generateOtpauthUri,
  getTotpEncryptionKey,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  hashBackupCode,
} from './totp.util.js';

describe('totp.util - RFC 6238 TOTP & AES-256-GCM Cryptographic Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. RFC 6238 Appendix B Official Test Vectors', () => {
    // Secret defined in RFC 6238 Appendix B:
    // ASCII "12345678901234567890" (20 bytes)
    // Base32 representation: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    const rfcSecret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

    it('validates Base32 representation of the RFC secret', () => {
      expect(rfcSecret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
      const decoded = base32Decode(rfcSecret);
      expect(decoded.toString('ascii')).toBe('12345678901234567890');
    });

    it('matches vector at T = 59s -> 287082', () => {
      const code = generateTotp(rfcSecret, 59 * 1000);
      expect(code).toBe('287082');
      expect(verifyTotp('287082', rfcSecret, { timeMs: 59 * 1000 })).toBe(true);
    });

    it('matches vector at T = 1111111109s -> 081804', () => {
      const code = generateTotp(rfcSecret, 1111111109 * 1000);
      expect(code).toBe('081804');
      expect(verifyTotp('081804', rfcSecret, { timeMs: 1111111109 * 1000 })).toBe(true);
    });

    it('matches vector at T = 1111111111s -> 050471', () => {
      const code = generateTotp(rfcSecret, 1111111111 * 1000);
      expect(code).toBe('050471');
      expect(verifyTotp('050471', rfcSecret, { timeMs: 1111111111 * 1000 })).toBe(true);
    });

    it('matches vector at T = 1234567890s -> 005924', () => {
      const code = generateTotp(rfcSecret, 1234567890 * 1000);
      expect(code).toBe('005924');
      expect(verifyTotp('005924', rfcSecret, { timeMs: 1234567890 * 1000 })).toBe(true);
    });

    it('matches vector at T = 2000000000s -> 279037', () => {
      const code = generateTotp(rfcSecret, 2000000000 * 1000);
      expect(code).toBe('279037');
      expect(verifyTotp('279037', rfcSecret, { timeMs: 2000000000 * 1000 })).toBe(true);
    });
  });

  describe('2. Bounded Clock Skew & Constant-Time Verification', () => {
    const secret = generateTotpSecret();
    const now = 1700000000 * 1000;

    it('verifies code within +/- 1 step window (skew tolerance)', () => {
      const currentCode = generateTotp(secret, now);
      const prevCode = generateTotp(secret, now - 30 * 1000);
      const nextCode = generateTotp(secret, now + 30 * 1000);

      expect(verifyTotp(currentCode, secret, { timeMs: now, window: 1 })).toBe(true);
      expect(verifyTotp(prevCode, secret, { timeMs: now, window: 1 })).toBe(true);
      expect(verifyTotp(nextCode, secret, { timeMs: now, window: 1 })).toBe(true);
    });

    it('rejects codes outside the window (+2 steps, -2 steps)', () => {
      const twoStepsAgo = generateTotp(secret, now - 60 * 1000);
      const twoStepsAhead = generateTotp(secret, now + 60 * 1000);

      expect(verifyTotp(twoStepsAgo, secret, { timeMs: now, window: 1 })).toBe(false);
      expect(verifyTotp(twoStepsAhead, secret, { timeMs: now, window: 1 })).toBe(false);
    });

    it('rejects invalid or non-numeric tokens', () => {
      expect(verifyTotp('', secret)).toBe(false);
      expect(verifyTotp('12345', secret)).toBe(false);
      expect(verifyTotp('1234567', secret)).toBe(false);
      expect(verifyTotp('abcdef', secret)).toBe(false);
      expect(verifyTotp(null as any, secret)).toBe(false);
    });
  });

  describe('3. AES-256-GCM Encryption & Key Security', () => {
    const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    it('encrypts and decrypts secret cleanly with AES-256-GCM round trip', () => {
      process.env.TOTP_ENCRYPTION_KEY = validKey;
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      const encrypted = encryptTotpSecret(secret);

      expect(encrypted).not.toEqual(secret);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0].length).toBe(24); // 12-byte IV in hex
      expect(parts[1].length).toBe(32); // 16-byte auth tag in hex

      const decrypted = decryptTotpSecret(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('uses random IV so repeated encryptions produce different ciphertexts', () => {
      process.env.TOTP_ENCRYPTION_KEY = validKey;
      const secret = 'SECRET1234567890';
      const enc1 = encryptTotpSecret(secret);
      const enc2 = encryptTotpSecret(secret);

      expect(enc1).not.toBe(enc2);
      expect(decryptTotpSecret(enc1)).toBe(secret);
      expect(decryptTotpSecret(enc2)).toBe(secret);
    });

    it('rejects tampered ciphertext with authenticated decryption failure', () => {
      process.env.TOTP_ENCRYPTION_KEY = validKey;
      const secret = 'SECRET1234567890';
      const encrypted = encryptTotpSecret(secret);
      const parts = encrypted.split(':');

      // Tamper ciphertext
      const tamperedData = (parseInt(parts[2][0], 16) ^ 1).toString(16) + parts[2].slice(1);
      const tamperedEncrypted = `${parts[0]}:${parts[1]}:${tamperedData}`;

      expect(() => decryptTotpSecret(tamperedEncrypted)).toThrow();
    });

    it('rejects tampered authentication tag', () => {
      process.env.TOTP_ENCRYPTION_KEY = validKey;
      const secret = 'SECRET1234567890';
      const encrypted = encryptTotpSecret(secret);
      const parts = encrypted.split(':');

      // Tamper tag
      const tamperedTag = (parseInt(parts[1][0], 16) ^ 1).toString(16) + parts[1].slice(1);
      const tamperedEncrypted = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      expect(() => decryptTotpSecret(tamperedEncrypted)).toThrow();
    });

    it('throws configuration error when TOTP_ENCRYPTION_KEY is missing outside test mode', () => {
      delete process.env.TOTP_ENCRYPTION_KEY;
      process.env.NODE_ENV = 'production';

      expect(() => getTotpEncryptionKey()).toThrow(
        /TOTP_ENCRYPTION_KEY environment variable is required/,
      );
    });

    it('allows fallback key strictly when NODE_ENV === "test"', () => {
      delete process.env.TOTP_ENCRYPTION_KEY;
      process.env.NODE_ENV = 'test';

      const key = getTotpEncryptionKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('rejects invalid key length (not 32 bytes)', () => {
      process.env.TOTP_ENCRYPTION_KEY = 'too-short-key';
      process.env.NODE_ENV = 'production';

      expect(() => getTotpEncryptionKey()).toThrow(
        /TOTP_ENCRYPTION_KEY must be exactly 32 bytes/,
      );
    });
  });

  describe('4. Backup Codes Generation & SHA-256 Hashing', () => {
    it('generates 10 8-character uppercase hex backup codes', () => {
      const codes = generateBackupCodes(10);
      expect(codes).toHaveLength(10);
      for (const code of codes) {
        expect(code.length).toBe(8);
        expect(/^[0-9A-F]{8}$/.test(code)).toBe(true);
      }
      // Check distinctness
      const unique = new Set(codes);
      expect(unique.size).toBe(10);
    });

    it('hashes backup codes with SHA-256 into 64-character hex strings', () => {
      const code = 'A1B2C3D4';
      const hash1 = hashBackupCode(code);
      const hash2 = hashBackupCode('a1b2c3d4'); // case-insensitive hash
      const hash3 = hashBackupCode('  A1B2C3D4  '); // trimmed

      expect(hash1.length).toBe(64);
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
    });
  });

  describe('5. Base32 & URI Formatting', () => {
    it('generates compliant otpauth URI for authenticator applications', () => {
      const uri = generateOtpauthUri({
        issuer: 'WhatBoutMe',
        accountName: 'admin@whatboutme.com',
        secret: 'JBSWY3DPEHPK3PXP',
      });

      expect(uri).toContain('otpauth://totp/WhatBoutMe%3Aadmin%40whatboutme.com');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=WhatBoutMe');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });

    it('rejects invalid characters in base32Decode', () => {
      expect(() => base32Decode('INVALID!@#')).toThrow(/Invalid Base32 character/);
    });
  });
});
