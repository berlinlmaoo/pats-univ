/**
 * Input validators shared by the registration form, the API and the app.
 * Error messages are i18n keys (see i18n/en.ts `validation.*`), translated by the caller.
 */
import { z } from 'zod';
import { parseIsoDate } from './format';
import { BATCH_MAX_CARDS, CARD_TOKEN_PATTERN, normalizeUid } from './card';
import { CHIP_TYPES } from './ntag';
import { NIM_PATTERN } from './nim';

/** Storage key of a photo uploaded during /join, before the member exists. */
export const MEMBER_PHOTO_PENDING_KEY = /^photos\/pending\/[a-f0-9-]{36}\.(jpg|png|webp)$/;
/** Accepted photo uploads: types, at most 5 MB, at least 256 px on the short side. */
export const MEMBER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MEMBER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const MEMBER_PHOTO_MIN_PX = 256;

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
  /** Printed on the KTM under FAVORITE DRINK. */
  favoriteDrink: requiredText(40),
  quotes: z.string().trim().max(140, 'validation.tooLong').optional().default(''),
  /** Key returned by POST /api/join/photo (so venue crew can match the face). */
  photoKey: z.string('validation.photoRequired').trim().regex(MEMBER_PHOTO_PENDING_KEY, 'validation.photoRequired'),
  email: emailSchema,
  phone: phoneSchema,
  consent: z.literal(true, 'validation.consentRequired'),
  locale: localeSchema.default('id'),
  /** `src` query parameter of the QR that brought the member in. */
  source: z.string().trim().max(64).optional(),
});

export type RegistrationInput = z.input<typeof registrationSchema>;

/** What a member may change on their own profile (PATCH /api/me). Name, birth date and city go through crew/HQ. */
export const profileUpdateSchema = z
  .object({
    locale: localeSchema,
    favoriteSong: requiredText(100),
    favoriteGenre: requiredText(50),
    favoriteDrink: requiredText(40),
    quotes: z.string().trim().max(140, 'validation.tooLong'),
  })
  .partial();
export type ProfileUpdate = z.output<typeof profileUpdateSchema>;
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

// ─── Events & check-in (Phase 1) ──────────────────────────────────────────────

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number('validation.numberInvalid').int('validation.numberInvalid').min(min, 'validation.numberRange').max(max, 'validation.numberRange').optional(),
  );

/**
 * Create/edit an event, from the dashboard form or the admin app. Times are wall-clock in the
 * event city's zone; the server turns them into UTC with `eventTimesFromInput`.
 */
export const eventInputSchema = z.object({
  title: z.string('validation.required').trim().min(2, 'validation.required').max(120, 'validation.tooLong'),
  description: z.string().trim().max(2000, 'validation.tooLong').optional().default(''),
  cityId: z.string('validation.cityRequired').trim().min(1, 'validation.cityRequired'),
  venueId: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().optional()),
  date: z.string('validation.required').trim().refine((v) => parseIsoDate(v) !== null, 'validation.dateInvalid'),
  startTime: z.string('validation.required').trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.timeInvalid'),
  endTime: z.string('validation.required').trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.timeInvalid'),
  opensBeforeMinutes: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number('validation.numberInvalid').int('validation.numberInvalid').min(0, 'validation.numberRange').max(720, 'validation.numberRange').default(60),
  ),
  capacity: optionalInt(1, 100_000),
  /** Draft events are hidden from members. */
  publish: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()).default(true),
});
export type EventInput = z.input<typeof eventInputSchema>;
export type EventFields = z.output<typeof eventInputSchema>;

export const eventActionSchema = z.object({ action: z.enum(['publish', 'open', 'close']) });
export type EventAction = z.output<typeof eventActionSchema>['action'];

export const MANUAL_REASON_MIN = 3;

/** What the scanner sends: a scanned app QR, or a member picked by name (manual). */
const cardTokenField = z.string().trim().regex(CARD_TOKEN_PATTERN, 'validation.cardTokenInvalid');
export const nfcUidSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const uid = normalizeUid(v);
    if (!uid) {
      ctx.addIssue({ code: 'custom', message: 'validation.uidInvalid' });
      return z.NEVER;
    }
    return uid;
  });

export const checkInSubjectSchema = z.discriminatedUnion('method', [
  /** A tapped card: the token from its NDEF URL and the chip UID read in the same session. */
  z.object({ method: z.literal('NFC'), token: cardTokenField, nfcUid: nfcUidSchema }),
  z.object({ method: z.literal('APP_QR'), token: z.string().trim().min(1).max(512) }),
  z.object({ method: z.literal('MANUAL'), memberId: z.string().trim().min(1).max(64) }),
]);

export const checkInPreviewSchema = z.object({ eventId: z.string().trim().min(1) }).and(checkInSubjectSchema);

/** Confirm after the preview: APP_QR carries the preview's ticket, MANUAL a mandatory reason. */
export const checkInCommitSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('NFC'), eventId: z.string().trim().min(1), ticket: z.string().trim().min(1).max(1024) }),
  z.object({ method: z.literal('APP_QR'), eventId: z.string().trim().min(1), ticket: z.string().trim().min(1).max(1024) }),
  z.object({
    method: z.literal('MANUAL'),
    eventId: z.string().trim().min(1),
    memberId: z.string().trim().min(1).max(64),
    reason: z
      .string('validation.reasonRequired')
      .trim()
      .min(MANUAL_REASON_MIN, 'validation.reasonRequired')
      .max(200, 'validation.tooLong'),
  }),
]);

// ─── Cards, stations, push (Phase 2) ──────────────────────────────────────────

export const REASON_MIN = 3;
const reasonField = z.string('validation.reasonRequired').trim().min(REASON_MIN, 'validation.reasonRequired').max(200, 'validation.tooLong');

/** New print batch from the queue: one city, each card once. */
export const createBatchSchema = z.object({
  cityId: z.string('validation.cityRequired').trim().min(1, 'validation.cityRequired'),
  cardIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, 'validation.batchEmpty')
    .max(BATCH_MAX_CARDS, 'validation.batchTooLarge'),
});

export const revokeCardSchema = z.object({ reason: reasonField });
export const reencodeRequestSchema = z.object({ reason: reasonField });
export const reencodeDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(200, 'validation.tooLong').optional(),
});

export const handoverSchema = z.object({ token: cardTokenField, nfcUid: nfcUidSchema });

export const stationLabelSchema = z.string().trim().min(1).max(60);

/** A station identifies a printed card (QR or NIM) and holds it while it encodes. */
export const stationClaimSchema = z.object({
  lookup: z.string('validation.required').trim().min(1, 'validation.required').max(200),
  station: stationLabelSchema,
  mode: z.enum(['encode', 'reencode']).default('encode'),
  /** Limit lookups to one batch (the station's current batch). */
  batchId: z.string().trim().min(1).optional(),
  /** An approved re-encode request: lets its requester encode that one card. */
  grantId: z.string().trim().min(1).optional(),
  /** Re-encode only: issue a new token (the old one stops working). */
  rotateToken: z.boolean().default(false),
});

export const stationKeySchema = z.object({ leaseId: z.string().trim().min(1), nfcUid: nfcUidSchema });
export const stationEncodedSchema = z.object({
  leaseId: z.string().trim().min(1),
  nfcUid: nfcUidSchema,
  /** Password protection was switched on in this write (first encode). */
  protectedNow: z.boolean(),
  /** Detected with GET_VERSION; stored for audit and re-encode. */
  chipType: z.enum(CHIP_TYPES),
});
export const stationReleaseSchema = z.object({
  leaseId: z.string().trim().min(1),
  /** Why the station gave up (a TagFailure code), for the audit log. */
  failure: z.string().trim().max(40).optional(),
  detail: z.string().trim().max(300).optional(),
});

export const deviceSchema = z.object({
  platform: z.enum(['IOS', 'ANDROID']),
  pushToken: z.string().trim().min(10).max(300),
  appVersion: z.string().trim().max(40).optional(),
});

export const notificationPrefsSchema = z.object({ events: z.boolean(), activity: z.boolean() }).partial();

export const markReadSchema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().min(1)).min(1).max(200) })]);

export const broadcastSchema = z.object({
  cityIds: z.array(z.string().trim().min(1)).min(1, 'validation.citiesRequired').max(50),
});
