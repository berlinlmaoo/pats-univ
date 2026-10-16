import { handoverSchema } from '@pats/shared';
import { limitScans, requireCrew } from '@/lib/auth/roles';
import { previewHandover } from '@/lib/cards/crew';
import { ok, readJson, route } from '@/lib/http/respond';

/** Hand-over step 1: the tapped card's owner and status. Records nothing. */
export const POST = route(async (req: Request) => {
  const admin = await requireCrew(req);
  limitScans(admin);
  return ok(await previewHandover(admin, handoverSchema.parse(await readJson(req))));
});
