import { requireMember } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { memberReports, submitReport } from '@/lib/loyalty/promoter';
export const GET = route(async (req: Request) =>
  ok(await memberReports((await requireMember(req)).member.id)),
);
export const POST = route(async (req: Request) => {
  const { member } = await requireMember(req);
  return ok(await submitReport(member.id, await readJson(req)), {
    status: 201,
  });
});
