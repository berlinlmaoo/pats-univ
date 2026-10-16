import { stationReleaseSchema } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';
import { releaseCard } from '@/lib/cards/station';

type Params = { params: Promise<{ id: string }> };

/** Give a held card back: cancelled, or the write failed (audited with the failure). */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireApiUser(req, ['SUPER_ADMIN', 'LOCAL_ADMIN']);
  const input = stationReleaseSchema.parse(await readJson(req));
  const { id } = await params;
  const held = await db.card.findUnique({ where: { leaseId: input.leaseId }, select: { id: true } });
  if (held && held.id !== id) throw new AppError('LEASE_LOST', 409);
  return ok(await releaseCard(user, input));
});
