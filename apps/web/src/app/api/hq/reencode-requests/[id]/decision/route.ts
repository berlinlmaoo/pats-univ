import { reencodeDecisionSchema } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { decideReencode } from '@/lib/cards/crew';
import { ok, readJson, route } from '@/lib/http/respond';

type Params = { params: Promise<{ id: string }> };

/** Approve or reject a city admin's re-encode request (same as the dashboard queue). */
export const POST = route(async (req: Request, { params }: Params) => {
  const hq = await requireApiUser(req, ['SUPER_ADMIN']);
  const input = reencodeDecisionSchema.parse(await readJson(req));
  await decideReencode(hq, (await params).id, input.approve, input.note);
  return ok({ ok: true });
});
