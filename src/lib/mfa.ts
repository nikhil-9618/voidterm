import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtSecret } from './env';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30-second period) with no external
 * dependency. Secrets are 160-bit random values, encrypted at rest with a key
 * derived from JWT_SECRET. Recovery codes are HMAC-hashed and single-use.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const CHALLENGE_ISSUER = 'voidterm';
const CHALLENGE_AUDIENCE = 'voidterm:mfa';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
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

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateTotpCode(secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1_000 / TOTP_PERIOD_SECONDS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Accept the current step and one adjacent step for clock drift. */
export function verifyTotpCode(secret: string, token: string, window = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const supplied = Buffer.from(token);
  const now = Date.now();

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = Buffer.from(
      generateTotpCode(secret, now + offset * TOTP_PERIOD_SECONDS * 1_000),
    );
    if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) {
      return true;
    }
  }

  return false;
}

function encryptionKey(): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      getJwtSecret(),
      Buffer.from('voidterm:mfa:salt:v1'),
      Buffer.from('voidterm:mfa:totp:v1'),
      32,
    ),
  );
}

/** AES-256-GCM: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptTotpSecret(value: string): string | null {
  try {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) return null;

    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`VOIDTERM:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=VOIDTERM&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Eight one-time codes, formatted xxxxx-xxxxx. Shown once at enrollment. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = Array.from(randomBytes(10))
      .map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length])
      .join('');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Recovery codes are bcrypt-hashed independently of JWT_SECRET, so rotating the
 * session key does not strand accounts that have MFA enabled.
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(code), 10);
}

/** Constant-time bcrypt match of a submitted code against stored hashes. */
export async function findRecoveryCodeHash(
  code: string,
  hashes: string[],
): Promise<string | null> {
  const normalized = normalizeRecoveryCode(code);
  for (const hash of hashes) {
    if (await bcrypt.compare(normalized, hash)) return hash;
  }
  return null;
}

/** Five-minute token proving the email OTP step succeeded; no session yet. */
export async function signMfaChallenge(userId: string): Promise<string> {
  return new SignJWT({ purpose: 'mfa' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(CHALLENGE_ISSUER)
    .setAudience(CHALLENGE_AUDIENCE)
    .setExpirationTime('5m')
    .sign(getJwtSecret());
}

export async function verifyMfaChallenge(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: CHALLENGE_ISSUER,
      audience: CHALLENGE_AUDIENCE,
    });

    if (payload.purpose !== 'mfa' || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}
