import { requireCrew } from '@/lib/auth/roles';
import { decideContent } from '@/lib/events/content';
import { ok, readJson, route } from '@/lib/http/respond';

/** HQ: { decision: "APPROVED" | "REJECTED", note } (note required to reject). Approval goes live. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  ok({ submission: await decideContent(await requireCrew(req), (await params).id, await readJson(req)) }),
);
