import { profileUpdateSchema } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http/respond';
import { buildMe } from '@/lib/me';

export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  return ok(await buildMe(user.id));
});

/**
 * The member's own settings: the app language (pushes and emails follow it) and the profile fields
 * they may change themselves (favorite drink, genre, song, quote). Name, birth date and city go
 * through crew/HQ; the photo has its own route (PUT /api/me/photo).
 */
export const PATCH = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const { locale, ...profile } = profileUpdateSchema.parse(await readJson(req));
  if (locale) await db.user.update({ where: { id: user.id }, data: { locale } });
  if (Object.keys(profile).length > 0) {
    // Only members have a profile; for crew accounts the profile fields are ignored.
    await db.member.updateMany({ where: { userId: user.id }, data: profile });
  }
  return ok(await buildMe(user.id));
});
