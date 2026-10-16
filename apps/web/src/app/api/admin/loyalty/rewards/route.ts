import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http/respond';
import { saveReward } from '@/lib/loyalty/rewards';
export const GET = route(async (req: Request) => {
  await requireApiUser(req, ['SUPER_ADMIN']);
  return ok({
    rewards: await db.reward.findMany({ orderBy: { createdAt: 'asc' } }),
    cities: await db.city.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  });
});
export const POST = route(async (req: Request) =>
  ok(
    await saveReward(
      await requireApiUser(req, ['SUPER_ADMIN']),
      await readJson(req),
    ),
  ),
);
