import { z } from 'zod';
import { requireCrew } from '@/lib/auth/roles';
import { ok, route, readJson } from '@/lib/http/respond';
import { configureDraw, runDraw, assignFreeCredit } from '@/lib/loyalty/draw';
export const POST = route(async (req: Request) => {
  const user = await requireCrew(req);
  const input = z.object({ action: z.enum(['configure', 'run', 'assign']), eventId: z.string(), creditId: z.string().optional() }).passthrough().parse(await readJson(req));
  if (input.action === 'configure') await configureDraw(user, input);
  if (input.action === 'run') await runDraw(user, input.eventId);
  if (input.action === 'assign') await assignFreeCredit(user, z.string().min(1).parse(input.creditId), input.eventId);
  return ok({ saved: true });
});
