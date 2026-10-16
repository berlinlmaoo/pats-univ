import { requireCityAccess } from '@/lib/auth/current-user';
import { requireCrew } from '@/lib/auth/roles';
import { eventAttendance } from '@/lib/checkin/service';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';

/** Live attendance feed: the admin app polls this while the event screen is open. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireCrew(req);
  const { id } = await params;
  const event = await db.event.findUnique({ where: { id }, select: { cityId: true } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(admin, event.cityId);
  return ok(await eventAttendance(id), { headers: { 'Cache-Control': 'no-store' } });
});
