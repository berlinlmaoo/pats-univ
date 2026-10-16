import { z } from 'zod';
import { requireCrew } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { lockRecap, saveRecap } from '@/lib/loyalty/operations';
export const POST = route(async (req: Request) =>
  ok(await saveRecap(await requireCrew(req), await readJson(req))),
);
export const PATCH = route(async (req: Request) => {
  const admin = await requireCrew(req);
  const input = z
    .object({ eventId: z.string().min(1) })
    .parse(await readJson(req));
  return ok(await lockRecap(admin, input.eventId));
});
