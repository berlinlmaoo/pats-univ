import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/http/respond';
import { blockingReservation, cardState, memberEventDetail, nextEventFor } from '@/lib/ux/member';

/**
 * Member Home (D4, UX04, F06): "what should I do next?". The next event with its journey steps,
 * card readiness, the booking that blocks new reservations (if any) and the unread count. Staff
 * accounts without a membership get `membership: "staffOnly"` and no personal sections (F03);
 * staff work lives in GET /api/admin/home.
 */
export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const now = new Date();
  const [member, unread] = await Promise.all([
    db.member.findUnique({ where: { userId: user.id }, select: { id: true, cityId: true, status: true, city: { select: { id: true, code: true, name: true } } } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  if (!member || member.status !== 'ACTIVE') {
    return ok({
      membership: member ? 'member' : 'staffOnly',
      homeCity: member?.city ?? null,
      next: null,
      card: member ? await cardState(member.id) : null,
      blockingReservation: null,
      unreadNotifications: unread,
      serverTime: now.toISOString(),
    });
  }
  const [{ event, national }, card, blocking] = await Promise.all([nextEventFor(member, now), cardState(member.id), blockingReservation(member.id)]);
  const detail = event ? await memberEventDetail(member, event, now) : null;
  return ok({
    membership: 'member',
    homeCity: member.city,
    /** null: nothing upcoming anywhere. `national: true`: nothing in the home city; this is elsewhere. */
    next: detail ? { ...detail, national } : null,
    card,
    blockingReservation: blocking
      ? { id: blocking.id, status: blocking.status, slotCode: blocking.slotCode, event: blocking.event, conversationId: blocking.conversation?.id ?? null }
      : null,
    unreadNotifications: unread,
    serverTime: now.toISOString(),
  });
});
