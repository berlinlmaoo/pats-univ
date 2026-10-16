import type { EventDetailResponse } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { eventInclude, toEventSummary } from '@/lib/events/service';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { member } = await requireMember(req);
  const { id } = await params;
  const event = await db.event.findFirst({
    where: { id, cityId: member.cityId, status: { not: 'DRAFT' } },
    include: eventInclude,
  });
  if (!event) throw new AppError('NOT_FOUND', 404);
  const mine = await db.checkIn.findUnique({
    where: { eventId_memberId: { eventId: id, memberId: member.id } },
    select: { checkedInAt: true, method: true },
  });
  const body: EventDetailResponse = {
    event: toEventSummary(event, { myCheckIn: mine ? { checkedInAt: mine.checkedInAt.toISOString(), method: mine.method } : null }),
  };
  return ok(body);
});
