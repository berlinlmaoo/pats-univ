import { validateCodeInput } from '@pats/shared';
import { requireCrew, limitScans } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { inspectCode } from '@/lib/loyalty/rewards';
export const POST = route(async (req: Request) => {
  const admin = await requireCrew(req);
  limitScans(admin);
  const input = validateCodeInput.parse(await readJson(req));
  return ok({
    redemption: await inspectCode(admin, input.code, input.eventId, true),
  });
});
