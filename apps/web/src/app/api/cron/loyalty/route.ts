import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { snapshotLeaderboards } from '@/lib/loyalty/leaderboard';
import { expireRedemptions } from '@/lib/loyalty/rewards';
export const POST = route(async (req: Request) => {
  const expected = process.env.CRON_SECRET;
  const supplied = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (
    !expected ||
    !supplied ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    throw new AppError('FORBIDDEN', 403);
  return ok({
    expired: await expireRedemptions(),
    snapshots: await snapshotLeaderboards(),
  });
});
