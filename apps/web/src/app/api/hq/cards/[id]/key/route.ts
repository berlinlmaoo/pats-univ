import { stationKeySchema } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';
import { cardKeyFor } from '@/lib/cards/station';

type Params = { params: Promise<{ id: string }> };

/** Station step 2: the chip's PWD/PACK for this UID, after the UID rules pass. Never stored. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireApiUser(req, ['SUPER_ADMIN', 'LOCAL_ADMIN']);
  const input = stationKeySchema.parse(await readJson(req));
  const { id } = await params;
  const held = await db.card.findUnique({ where: { leaseId: input.leaseId }, select: { id: true } });
  if (held && held.id !== id) throw new AppError('LEASE_LOST', 409);
  return ok(await cardKeyFor(user, input));
});
