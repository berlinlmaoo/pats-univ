import { getApiUser } from '@/lib/auth/current-user';
import { cardProfile } from '@/lib/cards/service';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { hit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/http/respond';

type Params = { params: Promise<{ token: string }> };

/** The public card profile behind a card URL, for the app's deep link. */
export const GET = route(async (req: Request, { params }: Params) => {
  const limit = hit(`card-profile:${clientIp(req)}`, 60, 60_000);
  if (!limit.ok) throw new AppError('RATE_LIMITED', 429, 'Too many lookups', { retryAfter: limit.retryAfter });
  const viewer = await getApiUser(req);
  const member = viewer ? await db.member.findUnique({ where: { userId: viewer.id }, select: { id: true } }) : null;
  const profile = await cardProfile((await params).token, member?.id, true);
  if (!profile) throw new AppError('CARD_NOT_FOUND', 404);
  return ok(profile);
});
