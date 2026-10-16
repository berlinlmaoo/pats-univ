import { revokeCardSchema } from '@pats/shared';
import { requireCrew } from '@/lib/auth/roles';
import { reportLost } from '@/lib/cards/crew';
import { ok, readJson, route } from '@/lib/http/respond';

type Params = { params: Promise<{ id: string }> };

/** Lost or damaged card: REVOKED, and a replacement joins the print queue. */
export const POST = route(async (req: Request, { params }: Params) => {
  const admin = await requireCrew(req);
  const { reason } = revokeCardSchema.parse(await readJson(req));
  return ok(await reportLost(admin, (await params).id, reason));
});
