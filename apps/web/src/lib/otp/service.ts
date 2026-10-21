import 'server-only';
import type { Locale, OtpRequestResponse } from '@pats/shared';
import type { OtpPurpose } from '@/generated/prisma';
import { hmac, randomOtp, safeEqual } from '../crypto';
import { db } from '../db';
import { AppError } from '../http/errors';
import { hit } from '../rate-limit';
import { otpSender } from './providers';

export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
/** Seconds between two sends to the same email. */
export const OTP_RESEND_SECONDS = 60;
/** Sends per email per hour. */
const OTP_SENDS_PER_HOUR = 5;
/** Sends per IP per hour (a venue Wi-Fi can carry many members). */
const OTP_SENDS_PER_IP_HOUR = 40;

const codeHash = (email: string, purpose: OtpPurpose, code: string) => hmac(`${purpose}:${email}:${code}`, 'otp');

/**
 * Creates and delivers a new code. Earlier unused codes for the same email + purpose stop
 * working, so only the latest email is ever valid.
 */
export async function issueOtp(input: {
  email: string;
  purpose: OtpPurpose;
  locale: Locale;
  ip: string;
  userId?: string;
}): Promise<OtpRequestResponse> {
  const now = new Date();

  const ipLimit = hit(`otp-ip:${input.ip}`, OTP_SENDS_PER_IP_HOUR, 60 * 60 * 1000);
  if (!ipLimit.ok) {
    throw new AppError('RATE_LIMITED', 429, 'Too many codes from this IP', {
      retryAfter: ipLimit.retryAfter,
      params: { seconds: ipLimit.retryAfter },
    });
  }

  const recent = await db.otpCode.findMany({
    where: { email: input.email, purpose: input.purpose, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const last = recent[0];
  if (last) {
    const wait = OTP_RESEND_SECONDS - Math.floor((now.getTime() - last.createdAt.getTime()) / 1000);
    if (wait > 0) {
      throw new AppError('RATE_LIMITED', 429, 'Resend cooldown', { retryAfter: wait, params: { seconds: wait } });
    }
  }
  if (recent.length >= OTP_SENDS_PER_HOUR) {
    const oldest = recent[recent.length - 1]!;
    const wait = Math.max(1, 3600 - Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000));
    throw new AppError('RATE_LIMITED', 429, 'Too many codes for this email', { retryAfter: wait, params: { seconds: wait } });
  }

  const sender = otpSender();
  const code = randomOtp();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  await db.$transaction([
    db.otpCode.updateMany({
      where: { email: input.email, purpose: input.purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    db.otpCode.create({
      data: {
        email: input.email,
        userId: input.userId,
        purpose: input.purpose,
        provider: sender.dbValue,
        codeHash: codeHash(input.email, input.purpose, code),
        expiresAt,
        ip: input.ip,
      },
    }),
  ]);

  let displayCode: string | undefined;
  try {
    ({ displayCode } = await sender.send({
      to: input.email,
      code,
      purpose: input.purpose,
      locale: input.locale,
      expiresInMinutes: OTP_TTL_MINUTES,
    }));
  } catch (err) {
    console.error('[otp] send failed', { provider: sender.name, err: String(err) });
    // A code that never arrived must not count against the resend cooldown.
    await db.otpCode.deleteMany({ where: { email: input.email, purpose: input.purpose, createdAt: { gte: now } } });
    throw new AppError('OTP_SEND_FAILED', 502, 'Could not deliver the code');
  }

  return {
    expiresAt: expiresAt.toISOString(),
    resendAfter: OTP_RESEND_SECONDS,
    ...(displayCode ? { demoCode: displayCode } : {}),
    // D7: say exactly where the code went and how long it lasts. The auth method itself is unchanged.
    destination: maskEmail(input.email),
    channel: 'email',
    ttlSeconds: OTP_TTL_MINUTES * 60,
  };
}

/** "rara.anindya@gmail.com" → "ra***@gmail.com": enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${shown}***@${domain}`;
}

/**
 * Checks `code` against the latest live code and consumes it. Wrong guesses count against
 * that code; after OTP_MAX_ATTEMPTS it is dead and a new one must be requested.
 */
export async function consumeOtp(input: { email: string; purpose: OtpPurpose; code: string; ip: string }): Promise<void> {
  const ipLimit = hit(`otp-verify-ip:${input.ip}`, 60, 10 * 60 * 1000);
  if (!ipLimit.ok) {
    throw new AppError('RATE_LIMITED', 429, 'Too many attempts', {
      retryAfter: ipLimit.retryAfter,
      params: { seconds: ipLimit.retryAfter },
    });
  }

  const now = new Date();
  const otp = await db.otpCode.findFirst({
    where: { email: input.email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt <= now) throw new AppError('OTP_EXPIRED', 400, 'No live code');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP_TOO_MANY_ATTEMPTS', 429, 'Too many attempts');

  if (!safeEqual(otp.codeHash, codeHash(input.email, input.purpose, input.code))) {
    const updated = await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    if (updated.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP_TOO_MANY_ATTEMPTS', 429, 'Too many attempts');
    throw new AppError('OTP_INVALID', 400, 'Wrong code');
  }

  // Conditional update: two parallel requests with the same code can't both succeed.
  const consumed = await db.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new AppError('OTP_EXPIRED', 400, 'Code already used');
}
