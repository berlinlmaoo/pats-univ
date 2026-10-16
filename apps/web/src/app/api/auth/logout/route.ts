import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/lib/auth/current-user';
import { revokeSessionBySecret } from '@/lib/auth/sessions';
import { ok, route } from '@/lib/http/respond';

const body = z.object({ refreshToken: z.string().optional() });

/** Ends the app session (refresh token in the body) or the dashboard session (cookie). */
export const POST = route(async (req: Request) => {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  const refreshToken = parsed.success ? parsed.data.refreshToken : undefined;
  if (refreshToken) await revokeSessionBySecret(refreshToken);
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (cookie) {
    await revokeSessionBySecret(cookie);
    jar.delete(SESSION_COOKIE);
  }
  return ok({ ok: true });
});
