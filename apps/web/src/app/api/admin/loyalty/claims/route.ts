import { requireCrew } from '@/lib/auth/roles';
import { ok, route, readJson } from '@/lib/http/respond';
import { crewClaims, reviewClaim } from '@/lib/loyalty/claims';
export const GET = route(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  return ok(await crewClaims(await requireCrew(req), { status: p.get('status'), eventId: p.get('eventId') }));
});
export const POST = route(async (req: Request) => ok(await reviewClaim(await requireCrew(req), await readJson(req))));
