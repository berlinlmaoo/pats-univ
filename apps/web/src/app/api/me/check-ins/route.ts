import type { CheckInHistoryResponse } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/http/respond';

/** Attendance history, newest first. */
export const GET = route(async (req: Request) => {
  const { member } = await requireMember(req);
  const rows = await db.checkIn.findMany({
    where: { memberId: member.id },
    orderBy: { checkedInAt: 'desc' },
    take: 100,
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          venue: { select: { name: true } },
          city: { select: { id: true, code: true, name: true, timezone: true } },
        },
      },
    },
  });
  const body: CheckInHistoryResponse = {
    checkIns: rows.map((c) => ({
      id: c.id,
      checkedInAt: c.checkedInAt.toISOString(),
      method: c.method,
      event: {
        id: c.event.id,
        title: c.event.title,
        venueName: c.event.venue?.name ?? null,
        startsAt: c.event.startsAt.toISOString(),
        city: c.event.city,
      },
    })),
  };
  return ok(body);
});
