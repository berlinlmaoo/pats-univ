import { checkInCommitSchema } from '@pats/shared';
import { limitScans, requireCrew } from '@/lib/auth/roles';
import { commitCheckIn } from '@/lib/checkin/service';
import { ok, readJson, route } from '@/lib/http/respond';

/** Scan step 2: record the check-in (PRODUCT.md §6.1). */
export const POST = route(async (req: Request) => {
  const admin = await requireCrew(req);
  limitScans(admin);
  const input = checkInCommitSchema.parse(await readJson(req));
  return ok(await commitCheckIn(admin, input), { status: 201 });
});
