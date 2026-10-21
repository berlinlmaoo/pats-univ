import type { CardStateResponse } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/http/respond';
import { cardState } from '@/lib/ux/member';

/** Card tab (D3, UX10, F07): digital QR readiness, separate from the physical card's progress. */
export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const member = await db.member.findUnique({ where: { userId: user.id }, select: { id: true } });
  const body: CardStateResponse = member ? await cardState(member.id) : { digital: { ready: false, reason: 'noMembership' }, physical: null, face: null };
  return ok(body);
});
