import { requireCrew } from '@/lib/auth/roles';
import { cityScope } from '@/lib/loyalty/operations';
import { db } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http/respond';
import { saveReward } from '@/lib/loyalty/rewards';
export const GET = route(async (req: Request) => {
  const cityId = cityScope(await requireCrew(req));
  return ok({
    rewards: await db.reward.findMany({ where: { type: 'DIRECT', cityId }, orderBy: { createdAt: 'asc' } }),
    venues: await db.venue.findMany({ where: { cityId }, select: { id: true, name: true, cityId: true }, orderBy: { name: 'asc' } }),
    cities: await db.city.findMany({
      where: { id: cityId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  });
});
export const POST = route(async (req: Request) =>
  ok(
    await saveReward(
      await requireCrew(req),
      await readJson(req),
    ),
  ),
);
