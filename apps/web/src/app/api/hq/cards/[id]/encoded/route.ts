import { stationEncodedSchema } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';
import { markEncoded } from '@/lib/cards/station';

type Params = { params: Promise<{ id: string }> };

/** Station step 3: the chip is written and verified; bind the UID and mark the card ENCODED. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireApiUser(req, ['SUPER_ADMIN', 'REGIONAL_ADMIN']);
  const input = stationEncodedSchema.parse(await readJson(req));
  const { id } = await params;
  const held = await db.card.findUnique({ where: { leaseId: input.leaseId }, select: { id: true } });
  if (held && held.id !== id) throw new AppError('LEASE_LOST', 409);
  return ok(await markEncoded(user, input));
});
