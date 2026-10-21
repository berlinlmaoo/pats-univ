import { z } from 'zod';
import { requireCrew } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';
import { recordDownPayment } from '@/lib/membership';
import { reservationCardInclude, recorderNames, toReservationCard } from '@/lib/ux/reservations';

/**
 * Record the deposit (DP) a member paid off-app (UX19, F26): { amount } in rupiah. Allowed while the
 * reservation is PENDING or CONFIRMED, once. It unlocks the member's next booking.
 * Returns the updated reservation card.
 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireCrew(req);
  const id = (await params).id;
  const { amount } = z.object({ amount: z.number().int().min(1).max(2_000_000_000) }).parse(await readJson(req));
  await recordDownPayment(admin, { id, amount });
  const row = await db.reservation.findUnique({ where: { id }, include: reservationCardInclude });
  if (!row) throw new AppError('NOT_FOUND', 404);
  return ok({ reservation: await toReservationCard(row, await recorderNames([row])) });
});
