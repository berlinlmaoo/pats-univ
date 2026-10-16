import { z } from 'zod';
import { refreshAppTokens } from '@/lib/auth/sessions';
import { ok, readJson, route } from '@/lib/http/respond';

const body = z.object({ refreshToken: z.string().min(20) });

/** Rotates the app's refresh token and returns a new access token. */
export const POST = route(async (req: Request) => {
  const { refreshToken } = body.parse(await readJson(req));
  return ok(await refreshAppTokens(refreshToken));
});
