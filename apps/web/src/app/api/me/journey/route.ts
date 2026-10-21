import { journeyTapSchema } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { eventInclude } from '@/lib/events/service';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';
import { memberEventDetail, tapStep } from '@/lib/ux/member';

/**
 * Tap a Home task step as done (D4): `event`, `poster` or `reservation` ("not this time").
 * Check-in and completion are never tappable: crew confirms attendance. Idempotent.
 * Returns the refreshed event detail (with journey).
 */
export const POST = route(async (req: Request) => {
  const { member } = await requireMember(req);
  const input = journeyTapSchema.parse(await readJson(req));
  const event = await db.event.findFirst({ where: { id: input.eventId, status: { not: 'DRAFT' } }, include: eventInclude });
  if (!event) throw new AppError('NOT_FOUND', 404);
  await tapStep(member, event.id, input.step);
  return ok(await memberEventDetail(member, event));
});
