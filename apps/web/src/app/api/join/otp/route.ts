import { registrationSchema } from '@pats/shared';
import { clientIp, ok, readJson, route } from '@/lib/http/respond';
import { issueOtp } from '@/lib/otp/service';
import { precheckRegistration } from '@/lib/registration';

/**
 * Step 1 of /join: validate the whole form (age, city, email not taken), then send the code.
 * Nothing about the applicant is stored until the code is verified.
 */
export const POST = route(async (req: Request) => {
  const input = registrationSchema.parse(await readJson(req));
  await precheckRegistration(input);
  const result = await issueOtp({ email: input.email, purpose: 'REGISTER', locale: input.locale, ip: clientIp(req) });
  return ok(result);
});
