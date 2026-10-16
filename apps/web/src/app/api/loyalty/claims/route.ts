import { z } from 'zod';
import { requireMember } from '@/lib/auth/roles';
import { ok, route, readJson } from '@/lib/http/respond';
import { memberClaims, saveClaim } from '@/lib/loyalty/claims';
export const GET = route(async (req: Request) => ok(await memberClaims((await requireMember(req)).member.id)));
export const POST = route(async (req: Request) => ok(await saveClaim((await requireMember(req)).member.id, await readJson(req)), { status: 201 }));
export const PATCH = route(async (req: Request) => {
 const { member } = await requireMember(req);
 const input = z.object({ id: z.string() }).passthrough().parse(await readJson(req));
 return ok(await saveClaim(member.id, input, input.id));
});
