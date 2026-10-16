import { requireCrew } from '@/lib/auth/roles';
import { ok, route, readJson } from '@/lib/http/respond';
import { crewClaims, reviewClaim } from '@/lib/loyalty/claims';
export const GET = route(async (req: Request) => ok(await crewClaims(await requireCrew(req))));
export const POST = route(async (req: Request) => ok(await reviewClaim(await requireCrew(req), await readJson(req))));
