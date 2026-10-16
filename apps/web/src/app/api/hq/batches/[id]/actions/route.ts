import { BATCH_ACTIONS } from '@pats/shared';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/current-user';
import { batchAction } from '@/lib/cards/service';
import { ok, readJson, route } from '@/lib/http/respond';

type Params = { params: Promise<{ id: string }> };

/** To the vendor, back at HQ, shipped to the city (same rules as the dashboard). */
export const POST = route(async (req: Request, { params }: Params) => {
  const hq = await requireApiUser(req, ['SUPER_ADMIN']);
  const { action } = z.object({ action: z.enum(BATCH_ACTIONS) }).parse(await readJson(req));
  await batchAction(hq, (await params).id, action);
  return ok({ ok: true });
});
