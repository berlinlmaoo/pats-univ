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
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server environment. Throws once, with every problem listed, when misconfigured. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  if (parsed.data.OTP_PROVIDER === 'email' && !parsed.data.SMTP_HOST) {
    throw new Error('Invalid environment: OTP_PROVIDER=email needs SMTP_HOST');
  }
  cached = parsed.data;
  return cached;
}

export const isDemoOtp = () => env().OTP_PROVIDER === 'demo';
