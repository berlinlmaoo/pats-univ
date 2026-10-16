import { stationClaimSchema } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { claimCard } from '@/lib/cards/station';
import { ok, readJson, route } from '@/lib/http/respond';

/**
 * Station step 1 (PLAN.md §2.2): identify a printed card by its QR or the member's NIM and hold
 * it for this station. HQ stations, or a city admin with an approved re-encode (grantId).
 */
export const POST = route(async (req: Request) => {
  const user = await requireApiUser(req, ['SUPER_ADMIN', 'REGIONAL_ADMIN']);
  const input = stationClaimSchema.parse(await readJson(req));
  return ok(await claimCard(user, input));
});
