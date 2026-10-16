import { requireApiUser } from '@/lib/auth/current-user';
import { ok, route } from '@/lib/http/respond';
import { drawState, grantQuarterWinners } from '@/lib/loyalty/draw';
export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  await grantQuarterWinners();
  return ok(await drawState(user, new URL(req.url).searchParams.get('eventId') ?? ''));
});
