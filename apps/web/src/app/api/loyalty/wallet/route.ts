import { requireMember } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { wallet } from '@/lib/loyalty/rewards';
export const GET = route(async (req: Request) => {
  const { member } = await requireMember(req);
  return ok(await wallet(member.id, member.cityId));
});
