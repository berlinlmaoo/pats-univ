import { requireCrew } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { eventWorkspace } from '@/lib/ux/staff';

/** One event workspace (D6, UX26, F25): attendance, reservations sold (table/sofa), claims, draw, recap, poster. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  ok(await eventWorkspace(await requireCrew(req), (await params).id)),
);
