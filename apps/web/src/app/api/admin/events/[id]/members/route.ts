import { requireCrew } from '@/lib/auth/roles';
import { searchMembersForEvent } from '@/lib/checkin/service';
import { ok, route } from '@/lib/http/respond';

/** Manual check-in search (?q=name or NIM). */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireCrew(req);
  const { id } = await params;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return ok(await searchMembersForEvent(admin, id, q.slice(0, 80)));
});
