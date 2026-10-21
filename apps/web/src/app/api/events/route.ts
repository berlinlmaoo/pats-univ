import type { EventListResponse } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { listEvents } from '@/lib/events/service';
import { ok, route } from '@/lib/http/respond';
import { memberSummaries } from '@/lib/ux/member';

/**
 * Member events. Default = home city. `scope=national` (or the legacy `scope=all`) = every ACTIVE
 * city (D5 National toggle ON). Each event carries the member's check-in, onward actions with
 * reasons (F09), timing labels (UX08) and the approved poster.
 */
export const GET = route(async (req: Request) => {
  const { member } = await requireMember(req);
  const now = new Date();
  const raw = new URL(req.url).searchParams.get('scope');
  const national = raw === 'all' || raw === 'national';
  const { upcoming, past } = await listEvents(
    { ...(national ? { city: { active: true } } : { cityId: member.cityId }), status: { not: 'DRAFT' } },
    now,
  );
  const [up, done, homeCity] = await Promise.all([
    memberSummaries(member, upcoming, now),
    memberSummaries(member, past, now),
    db.city.findUnique({ where: { id: member.cityId }, select: { id: true, code: true, name: true } }),
  ]);
  const body: EventListResponse = { upcoming: up, past: done, scope: national ? 'national' : 'city', homeCity };
  return ok(body);
});
