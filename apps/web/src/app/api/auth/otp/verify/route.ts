import { otpVerifySchema, type LoginResponse } from '@pats/shared';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/lib/auth/current-user';
import { findLoginUser } from '@/lib/auth/login';
import { createSession, issueAppTokens, SESSION_TTL_DAYS } from '@/lib/auth/sessions';
import { clientIp, ok, readJson, route } from '@/lib/http/respond';
import { buildMe } from '@/lib/me';
import { consumeOtp } from '@/lib/otp/service';

const body = otpVerifySchema.extend({ client: z.enum(['app', 'web']).default('app') });

/**
 * Step 2 of login. The app gets an access + refresh token pair; the HQ dashboard gets an
 * httpOnly session cookie.
 */
export const POST = route(async (req: Request) => {
  const input = body.parse(await readJson(req));
  const ip = clientIp(req);
  const meta = { userAgent: req.headers.get('user-agent'), ip };
  const user = await findLoginUser(input.email, input.client === 'web' ? 'hq' : 'app');
  await consumeOtp({ email: user.email, purpose: 'LOGIN', code: input.code, ip });

  if (input.client === 'web') {
    const { secret } = await createSession(user, 'WEB', meta);
    (await cookies()).set(SESSION_COOKIE, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_DAYS.WEB * 24 * 60 * 60,
    });
    return ok({ ok: true });
  }

  const tokens = await issueAppTokens(user, meta);
  const response: LoginResponse = { ...tokens, me: await buildMe(user.id) };
  return ok(response);
});
