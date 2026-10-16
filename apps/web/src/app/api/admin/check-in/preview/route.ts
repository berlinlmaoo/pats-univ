import { checkInPreviewSchema } from '@pats/shared';
import { limitScans, requireCrew } from '@/lib/auth/roles';
import { previewCheckIn } from '@/lib/checkin/service';
import { ok, readJson, route } from '@/lib/http/respond';

/** Scan step 1: who is this and can they check in? Records nothing. */
export const POST = route(async (req: Request) => {
  const admin = await requireCrew(req);
  limitScans(admin);
  const input = checkInPreviewSchema.parse(await readJson(req));
  return ok(await previewCheckIn(admin, input));
});
