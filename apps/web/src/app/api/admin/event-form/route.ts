import type { EventFormMetaResponse } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { getSetting } from '@/lib/settings';

/** What the app's event form needs: the admin's city, its venues and the default window. */
export const GET = route(async (req: Request) => {
  const admin = await requireApiUser(req, ['REGIONAL_ADMIN']);
  if (!admin.cityId) throw new AppError('FORBIDDEN', 403);
  const city = await db.city.findUniqueOrThrow({
    where: { id: admin.cityId },
    select: { id: true, code: true, name: true, timezone: true, venues: { select: { id: true, name: true }, orderBy: { name: 'asc' } } },
  });
  const { venues, ...rest } = city;
  const body: EventFormMetaResponse = { city: rest, venues, opensBeforeMinutes: await getSetting(db, 'checkInOpensBeforeMinutes') };
  return ok(body);
});
