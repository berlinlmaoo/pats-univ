import type { CitySummary } from '@pats/shared';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/http/respond';

/** Cities open for registration (public). */
export const GET = route(async () => {
  const cities: CitySummary[] = await db.city.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  });
  return ok({ cities });
});
