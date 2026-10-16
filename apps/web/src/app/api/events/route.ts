import type { EventListResponse } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { listEvents, toEventSummary } from '@/lib/events/service';
import { ok, route } from '@/lib/http/respond';

/** Member: published events of their home city, with their own check-in on each. */
export const GET = route(async (req: Request) => {
  const { member } = await requireMember(req);
  const now = new Date();
  const { upcoming, past } = await listEvents({ cityId: member.cityId, status: { not: 'DRAFT' } }, now);
  const ids = [...upcoming, ...past].map((e) => e.id);
  const mine = await db.checkIn.findMany({
    where: { memberId: member.id, eventId: { in: ids } },
    select: { eventId: true, checkedInAt: true, method: true },
  });
  const byEvent = new Map(mine.map((c) => [c.eventId, { checkedInAt: c.checkedInAt.toISOString(), method: c.method }]));
  const summary = (e: (typeof upcoming)[number]) => toEventSummary(e, { myCheckIn: byEvent.get(e.id) ?? null }, now);
  const body: EventListResponse = { upcoming: upcoming.map(summary), past: past.map(summary) };
  return ok(body);
});
