import { can, createBatchSchema } from '@pats/shared';
import { generateBatchFiles } from '@/lib/card-print/generate';
import { createBatch } from '@/lib/cards/service';
import { requireApiUser } from '@/lib/auth/current-user';
import { stationBatches } from '@/lib/cards/station';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';

/** Batches back at HQ or being encoded, with live progress, for the stations to pick from. */
export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req, ['SUPER_ADMIN']);
  if (!can(user.role, 'card.encode')) throw new AppError('FORBIDDEN', 403);
  return ok(await stationBatches());
});

/** New print batch from the queue (same rules as the dashboard), with its print files. */
export const POST = route(async (req: Request) => {
  const hq = await requireApiUser(req, ['SUPER_ADMIN']);
  const input = createBatchSchema.parse(await readJson(req));
  const batch = await createBatch(hq, input);
  const files = await generateBatchFiles(batch.id);
  return ok({ batch: { id: batch.id, number: batch.number, cardCount: batch.cardCount }, files }, { status: 201 });
});
