import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from '@pats/shared';
import { env } from './env';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Keyed hash, so a leaked table of OTP hashes can't be brute-forced offline. */
export function hmac(value: string, purpose: string): string {
  return createHmac('sha256', `${env().AUTH_SECRET}:${purpose}`).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Uniformly random numeric code, leading zeros allowed. */
export function randomOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/** URL-safe opaque token (refresh tokens, session cookies). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
