import 'server-only';
import { toZonedInput, zoneLabel } from '@pats/shared';
import type { CityOption } from '@/app/(admin)/events/event-form';
import { db } from '../db';
import { getSetting } from '../settings';

/** Cities with their venues, for the event form. Shared with the event page. */
export async function eventFormOptions(cityId?: string): Promise<{ cities: CityOption[]; defaults: { opensBeforeMinutes: number; date: string } }> {
  const [cities, opensBeforeMinutes] = await Promise.all([
    db.city.findMany({
      where: { active: true, id: cityId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, timezone: true, venues: { select: { id: true, name: true }, orderBy: { name: 'asc' } } },
    }),
    getSetting(db, 'checkInOpensBeforeMinutes'),
  ]);
  const now = new Date();
  return {
    cities: cities.map(({ timezone, ...c }) => ({ ...c, zoneLabel: zoneLabel(now, timezone) })),
    defaults: { opensBeforeMinutes, date: toZonedInput(now, cities[0]?.timezone ?? 'Asia/Jakarta').date },
  };
}

