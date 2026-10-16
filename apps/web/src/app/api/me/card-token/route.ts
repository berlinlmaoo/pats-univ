import { requireMember } from '@/lib/auth/roles';
import { issueCardToken } from '@/lib/checkin/service';
import { ok, route } from '@/lib/http/respond';

/** The rotating check-in QR. The app asks again before each one expires. */
export const GET = route(async (req: Request) => {
  const { member } = await requireMember(req);
  return ok(await issueCardToken(member.id), { headers: { 'Cache-Control': 'no-store' } });
});
