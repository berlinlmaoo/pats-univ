import { requireCrew } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { eventReservations } from '@/lib/ux/staff';

/** The event's reservations as cards (poster highlight, slot kind, deposit). `?status=PENDING` filters. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireCrew(req);
  return ok(await eventReservations(admin, (await params).id, new URL(req.url).searchParams.get('status') ?? undefined));
});
