/**
 * Input validators shared by the registration form, the API and the app.
 * Error messages are i18n keys (see i18n/en.ts `validation.*`), translated by the caller.
 */
import { z } from 'zod';
import { parseIsoDate } from './format';
import { NIM_PATTERN } from './nim';

export const OTP_LENGTH = 6;

export const emailSchema = z
  .string('validation.required')
  .trim()
  .toLowerCase()
  .min(1, 'validation.required')
  .max(254, 'validation.emailInvalid')
  .pipe(z.email('validation.emailInvalid'));

/**
 * Normalises a phone number to E.164. Indonesian local formats are accepted
 * (0812…, 812…, 62812…, +62 812-…); other countries need an explicit "+".
 * Returns null when the number cannot be a valid mobile number.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  let e164: string;
  if (hasPlus) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('62')) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('0')) {
    e164 = `+62${digits.slice(1)}`;
  } else if (digits.startsWith('8')) {
    e164 = `+62${digits}`;
  } else {
    return null;
  }
  if (e164.startsWith('+62')) {
    // Indonesian mobile numbers: +62 8xx, 9 to 12 digits after the country code.
    return /^\+628\d{8,11}$/.test(e164) ? e164 : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export const phoneSchema = z
  .string('validation.required')
  .trim()
  .min(1, 'validation.required')
  .transform((value, ctx) => {
    const e164 = normalizePhone(value);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'validation.phoneInvalid' });
      return z.NEVER;
    }
    return e164;
  });

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), 'validation.otpInvalid');

export const localeSchema = z.enum(['en', 'id']);

export const dateOfBirthSchema = z
  .string('validation.required')
  .trim()
  .min(1, 'validation.required')
  .refine((v) => {
    const d = parseIsoDate(v);
    if (!d) return false;
    const now = new Date();
    return d.year >= 1900 && Date.UTC(d.year, d.month - 1, d.day) <= now.getTime();
  }, 'validation.dateInvalid');

const requiredText = (max: number) =>
  z.string('validation.required').trim().min(1, 'validation.required').max(max, 'validation.tooLong');

/** Fields of the public /join form (PRODUCT.md §4.1 step 2). */
export const registrationSchema = z.object({
  fullName: z.string('validation.required').trim().min(2, 'validation.nameTooShort').max(80, 'validation.tooLong'),
  dateOfBirth: dateOfBirthSchema,
  cityId: z.string('validation.cityRequired').trim().min(1, 'validation.cityRequired'),
  favoriteSong: requiredText(100),
  favoriteGenre: requiredText(50),
  quotes: z.string().trim().max(140, 'validation.tooLong').optional().default(''),
  email: emailSchema,
  phone: phoneSchema,
  consent: z.literal(true, 'validation.consentRequired'),
  locale: localeSchema.default('id'),
  /** `src` query parameter of the QR that brought the member in. */
  source: z.string().trim().max(64).optional(),
});

export type RegistrationInput = z.input<typeof registrationSchema>;
export type Registration = z.output<typeof registrationSchema>;

export const otpRequestSchema = z.object({
  email: emailSchema,
  locale: localeSchema.default('id'),
});

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

export const nimSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(NIM_PATTERN, 'validation.nimInvalid');

export const cityCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'validation.cityCodeInvalid');

/** First i18n key per field, for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_';
    if (!out[field]) out[field] = issue.message.startsWith('validation.') ? issue.message : 'validation.invalid';
  }
  return out;
}
