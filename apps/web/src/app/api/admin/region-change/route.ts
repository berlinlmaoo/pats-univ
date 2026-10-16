import { can } from '@pats/shared';
import { requireCrew } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route, readJson } from '@/lib/http/respond';
import { decideRegionChange } from '@/lib/membership';
export const GET = route(async (req: Request) => {
  const admin = await requireCrew(req);
  if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  return ok({ requests: await db.regionChangeRequest.findMany({ where: { status: 'PENDING' }, include: { member: { select: { fullName: true, nim: true } }, fromCity: { select: { name: true } }, toCity: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }) });
});
export const POST = route(async (req: Request) => { await decideRegionChange(await requireCrew(req), await readJson(req)); return ok({ saved: true }); });
