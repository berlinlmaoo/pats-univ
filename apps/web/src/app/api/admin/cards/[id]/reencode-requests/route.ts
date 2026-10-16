import { reencodeRequestSchema } from '@pats/shared';
import { requireCrew } from '@/lib/auth/roles';
import { requestReencode } from '@/lib/cards/crew';
import { ok, readJson, route } from '@/lib/http/respond';

type Params = { params: Promise<{ id: string }> };

/** Ask HQ for one re-encode of a delivered card whose chip still works. */
export const POST = route(async (req: Request, { params }: Params) => {
  const admin = await requireCrew(req);
  const { reason } = reencodeRequestSchema.parse(await readJson(req));
  return ok(await requestReencode(admin, (await params).id, reason), { status: 201 });
});
