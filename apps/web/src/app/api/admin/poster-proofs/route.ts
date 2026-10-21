import { requireCrew } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { proofQueue } from '@/lib/ux/poster-proof';

/** Poster-proof review queue (regional: own city, HQ: all). `?status=PENDING|APPROVED|REJECTED&eventId=`. */
export const GET = route(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  return ok(await proofQueue(await requireCrew(req), { status: p.get('status'), eventId: p.get('eventId') }));
});
