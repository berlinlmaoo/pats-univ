import { requireMember } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { anonymizeMember } from '@/lib/membership';
export const POST = route(async (req: Request) => { await anonymizeMember((await requireMember(req)).member.id); return ok({ saved: true }); });
