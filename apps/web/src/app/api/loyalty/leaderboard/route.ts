import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/http/respond';
import { leaderboard } from '@/lib/loyalty/leaderboard';
export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const member = await db.member.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  const p = new URL(req.url).searchParams;
  return ok(
    await leaderboard({
      cityId: p.get('cityId') || undefined,
      month: p.get('month') || undefined,
      eventId: p.get('eventId') || undefined,
      memberId: member?.id,
    }),
  );
});
