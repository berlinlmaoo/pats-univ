import { handoverSchema } from '@pats/shared';
import { limitScans, requireCrew } from '@/lib/auth/roles';
import { handOverCard } from '@/lib/cards/crew';
import { ok, readJson, route } from '@/lib/http/respond';

/** Hand-over step 2: the member has their card: ENCODED → DELIVERED (PRODUCT.md §4.1 step 8). */
export const POST = route(async (req: Request) => {
  const admin = await requireCrew(req);
  limitScans(admin);
  return ok(await handOverCard(admin, handoverSchema.parse(await readJson(req))));
});
