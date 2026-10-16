import { redeemInput } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { issueReward } from '@/lib/loyalty/rewards';
export const POST = route(async (req: Request) => {
  const { member } = await requireMember(req);
  const input = redeemInput.parse(await readJson(req));
  return ok(await issueReward(member.id, input, false), { status: 201 });
});
