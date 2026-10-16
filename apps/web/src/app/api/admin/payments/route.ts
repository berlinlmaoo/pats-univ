import { z } from 'zod';
import { requireCrew } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { cityScope } from '@/lib/loyalty/operations';
import { ok, route, readJson } from '@/lib/http/respond';
import { recordDownPayment, recordCardFee } from '@/lib/membership';
export const GET = route(async (req: Request) => {
  const cityId = cityScope(await requireCrew(req));
  return ok({ cards: await db.card.findMany({ where: { replacementFee: { not: null }, member: { cityId } }, include: { member: { select: { fullName: true, nim: true } } }, orderBy: { createdAt: 'desc' } }),
    reservations: await db.reservation.findMany({ where: { status: 'CONFIRMED', event: { cityId } }, include: { member: { select: { fullName: true } }, event: { select: { title: true } } }, orderBy: { createdAt: 'desc' } }) });
});
export const POST = route(async (req: Request) => {
  const user = await requireCrew(req);
  const input = z.object({ kind: z.enum(['card', 'reservation']), id: z.string(), amount: z.number().optional() }).parse(await readJson(req));
  if (input.kind === 'card') await recordCardFee(user, input.id); else await recordDownPayment(user, input);
  return ok({ saved: true });
});
