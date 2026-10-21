import { requireCrew } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { decideProof } from '@/lib/ux/poster-proof';

/** { decision: "APPROVED" | "REJECTED", reason } (reason ≥ 3 chars to reject). Approval credits posterShareXp once. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  ok({ proof: await decideProof(await requireCrew(req), (await params).id, await readJson(req)) }),
);
