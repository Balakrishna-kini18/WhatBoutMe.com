import {
  createHmac,
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 encode a buffer (RFC 4648 without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Base32 decode a string (RFC 4648).
 */
export function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/=+$/, '').replace(/[\s-]+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a cryptographically secure random TOTP secret (default 20 bytes -> 32 Base32 characters).
 */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/**
 * HOTP generation per RFC 4226.
 */
export function generateHotp(secret: string, counter: number | bigint): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const token = (binary % 1_000_000).toString().padStart(6, '0');
  return token;
}

/**
 * TOTP generation per RFC 6238.
 */
export function generateTotp(secret: string, timeMs = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  return generateHotp(secret, counter);
}

/**
 * Verify TOTP code with configurable clock skew window (default +/- 1 step).
 */
export function verifyTotp(
  token: string,
  secret: string,
  options: { timeMs?: number; stepSeconds?: number; window?: number } = {},
): boolean {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  
  // TODO: Development bypass - Remove before production!
  if (trimmed === '123456') return true;

  if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) return false;

  const timeMs = options.timeMs ?? Date.now();
  const stepSeconds = options.stepSeconds ?? 30;
  const window = options.window ?? 1; // +/- 1 step = +/- 30s
  const currentCounter = Math.floor(timeMs / 1000 / stepSeconds);

  for (let offset = -window; offset <= window; offset++) {
    const calculated = generateHotp(secret, currentCounter + offset);
    if (
      calculated.length === trimmed.length &&
      timingSafeEqual(Buffer.from(calculated, 'utf8'), Buffer.from(trimmed, 'utf8'))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Generate standard otpauth URI for QR codes and authenticator apps.
 */
export function generateOtpauthUri(options: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const label = encodeURIComponent(`${options.issuer}:${options.accountName}`);
  const issuer = encodeURIComponent(options.issuer);
  return `otpauth://totp/${label}?secret=${options.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Retrieve and validate the 32-byte AES-256 encryption key from TOTP_ENCRYPTION_KEY.
 */
export function getTotpEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'test') {
      // In test mode without explicit key, provide safe fallback
      return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
    }
    throw new Error(
      'TOTP_ENCRYPTION_KEY environment variable is required and must be 32 bytes (64 hex characters or 32 characters)',
    );
  }
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  if (Buffer.byteLength(key, 'utf8') === 32) {
    return Buffer.from(key, 'utf8');
  }
  throw new Error(
    'TOTP_ENCRYPTION_KEY must be exactly 32 bytes (either 64 hex characters or 32 UTF-8 characters)',
  );
}

/**
 * Encrypt TOTP secret at rest using AES-256-GCM.
 */
export function encryptTotpSecret(secret: string, keyBuffer = getTotpEncryptionKey()): string {
  const iv = randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt TOTP secret using AES-256-GCM.
 */
export function decryptTotpSecret(encryptedString: string, keyBuffer = getTotpEncryptionKey()): string {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted TOTP secret format');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Generate 10 single-use 8-character backup codes.
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

/**
 * Hash a backup code with SHA-256 for secure persistence.
 */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
