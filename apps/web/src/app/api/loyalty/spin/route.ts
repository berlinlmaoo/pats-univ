import { spinInput } from '@pats/shared';
import { requireMember } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { takeDrawSlot } from '@/lib/loyalty/draw';
export const POST = route(async (req: Request) => {
  const { member } = await requireMember(req);
  const input = spinInput.parse(await readJson(req));
  return ok(await takeDrawSlot(member.id, input.eventId), { status: 201 });
});
