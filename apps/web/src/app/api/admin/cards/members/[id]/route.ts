import { requireCrew } from '@/lib/auth/roles';
import { memberCards } from '@/lib/cards/crew';
import { ok, route } from '@/lib/http/respond';

type Params = { params: Promise<{ id: string }> };

/** One member's cards and the latest re-encode request on the live one. */
export const GET = route(async (req: Request, { params }: Params) => {
  const admin = await requireCrew(req);
  return ok(await memberCards(admin, (await params).id));
});
