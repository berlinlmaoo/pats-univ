import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { ok, route, readJson } from '@/lib/http/respond';
import { requestRegionChange } from '@/lib/membership';
export const GET = route(async (req: Request) => {
  const { member } = await requireMember(req);
  return ok({ requests: await db.regionChangeRequest.findMany({ where: { memberId: member.id }, include: { toCity: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    cities: await db.city.findMany({ where: { active: true, id: { not: member.cityId } }, select: { id: true, name: true } }) });
});
export const POST = route(async (req: Request) => ok(await requestRegionChange((await requireMember(req)).member.id, await readJson(req))));
