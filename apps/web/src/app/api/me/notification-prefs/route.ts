import { notificationPrefsSchema, type NotificationPrefsResponse } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http/respond';
import { prefsOf } from '@/lib/push/notify';

export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
  return ok<NotificationPrefsResponse>({ prefs: prefsOf(row.notificationPrefs) });
});

/** Turn a push category on or off. Account and crew messages can't be turned off. */
export const PATCH = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const patch = notificationPrefsSchema.parse(await readJson(req));
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
  const prefs = { ...prefsOf(row.notificationPrefs), ...patch };
  await db.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
  return ok<NotificationPrefsResponse>({ prefs });
});
