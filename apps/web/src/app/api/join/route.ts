import { otpCodeSchema, registrationSchema } from '@pats/shared';
import { AppError } from '@/lib/http/errors';
import { clientIp, ok, readJson, route } from '@/lib/http/respond';
import { consumeOtp } from '@/lib/otp/service';
import { hit } from '@/lib/rate-limit';
import { precheckRegistration, registerMember } from '@/lib/registration';

const body = registrationSchema.extend({ code: otpCodeSchema });

/** Step 2 of /join: verify the email code, create the member and allocate the NIM. */
export const POST = route(async (req: Request) => {
  const ip = clientIp(req);
  const limit = hit(`join:${ip}`, 30, 60 * 60 * 1000);
  if (!limit.ok) {
    throw new AppError('RATE_LIMITED', 429, 'Too many registrations', {
      retryAfter: limit.retryAfter,
      params: { seconds: limit.retryAfter },
    });
  }
  const { code, ...input } = body.parse(await readJson(req));
  const parsed = registrationSchema.parse(input);
  // Re-check before burning the code: the email may have been registered meanwhile.
  await precheckRegistration(parsed);
  await consumeOtp({ email: parsed.email, purpose: 'REGISTER', code, ip });
  return ok(await registerMember(parsed), { status: 201 });
});
