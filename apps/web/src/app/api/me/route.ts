import { localeSchema } from '@pats/shared';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http/respond';
import { buildMe } from '@/lib/me';

export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  return ok(await buildMe(user.id));
});

/** The app's language, so pushes and emails reach the user in the language they read the app in. */
export const PATCH = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const { locale } = z.object({ locale: localeSchema }).parse(await readJson(req));
  await db.user.update({ where: { id: user.id }, data: { locale } });
  return ok(await buildMe(user.id));
});
