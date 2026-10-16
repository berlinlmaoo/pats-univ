import { otpRequestSchema } from '@pats/shared';
import { z } from 'zod';
import { findLoginUser } from '@/lib/auth/login';
import { clientIp, ok, readJson, route } from '@/lib/http/respond';
import { issueOtp } from '@/lib/otp/service';

const body = otpRequestSchema.extend({ audience: z.enum(['app', 'hq']).default('app') });

/** Step 1 of login: send a 6-digit code to an existing account's email. */
export const POST = route(async (req: Request) => {
  const input = body.parse(await readJson(req));
  const user = await findLoginUser(input.email, input.audience);
  const result = await issueOtp({
    email: user.email,
    purpose: 'LOGIN',
    locale: user.locale ?? input.locale,
    ip: clientIp(req),
    userId: user.id,
  });
  return ok(result);
});
