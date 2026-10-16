import { markReadSchema } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http/respond';

export const POST = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const input = markReadSchema.parse(await readJson(req));
  const res = await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...('ids' in input ? { id: { in: input.ids } } : {}) },
    data: { readAt: new Date() },
  });
  return ok({ updated: res.count });
});
