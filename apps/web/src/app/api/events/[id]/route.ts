import type { EventDetailResponse } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { eventInclude } from '@/lib/events/service';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { memberEventDetail } from '@/lib/ux/member';

/** Member event detail: the event, its journey (D4/D5) and my reservation with its deposit. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { member } = await requireMember(req);
  const { id } = await params;
  const event = await db.event.findFirst({
    where: { id, status: { not: 'DRAFT' } },
    include: eventInclude,
  });
  if (!event) throw new AppError('NOT_FOUND', 404);
  const body: EventDetailResponse = await memberEventDetail(member, event);
  return ok(body);
});
