import 'server-only';
import { OTP_PROVIDERS } from '@pats/shared';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default('http://localhost:3000'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  OTP_PROVIDER: z.enum(OTP_PROVIDERS).default('demo'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('PATS University <no-reply@patsuniv.znetworks.id>'),

  // Cards (Phase 2). The NTAG213 password of every card is derived from this and the chip UID,
  // so it must never change once cards are encoded. Dev falls back to a key derived from AUTH_SECRET.
  CARD_KEY_SECRET: z.string().min(32, 'CARD_KEY_SECRET must be at least 32 characters').optional(),
  /** Card print template folder (see src/lib/card-print/templates/README.md). */
  CARD_TEMPLATE_DIR: z.string().optional(),
  /** Chromium for rendering print PDFs; defaults to Playwright's local browser in dev. */
  CHROMIUM_PATH: z.string().optional(),

  // File storage: local disk (a Docker volume in production) or any S3-compatible bucket.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('.data/storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Push: "expo" sends through the Expo Push API; "log" records notifications without sending.
  PUSH_PROVIDER: z.enum(['expo', 'log']).default('expo'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Bearer secret the systemd timer sends to /api/cron/*. */
  CRON_SECRET: z.string().min(16).optional(),

  // Universal / app links for card URLs (served from /.well-known).
  APPLE_TEAM_ID: z.string().regex(/^[A-Z0-9]{10}$/).optional(),
  /** Comma-separated SHA-256 fingerprints of the Android signing certificates. */
  ANDROID_CERT_SHA256: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server environment. Throws once, with every problem listed, when misconfigured. */
export function env(): Env {
  if (cached) return cached;
  // Compose passes unset optional keys as empty strings (APPLE_TEAM_ID: ${APPLE_TEAM_ID:-}); treat those as unset, not as invalid values.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  if (parsed.data.OTP_PROVIDER === 'email' && !parsed.data.SMTP_HOST) {
    throw new Error('Invalid environment: OTP_PROVIDER=email needs SMTP_HOST');
  }
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build' && !parsed.data.CARD_KEY_SECRET) {
    throw new Error('Invalid environment: CARD_KEY_SECRET is required in production');
  }
  if (parsed.data.STORAGE_DRIVER === 's3') {
    const missing = (['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const).filter((k) => !parsed.data[k]);
    if (missing.length) throw new Error(`Invalid environment: STORAGE_DRIVER=s3 needs ${missing.join(', ')}`);
  }
  cached = parsed.data;
  return cached;
}

export const isDemoOtp = () => env().OTP_PROVIDER === 'demo';
