import { requireApiUser } from '@/lib/auth/current-user';
import { ok, route } from '@/lib/http/respond';
import { buildMe } from '@/lib/me';

export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  return ok(await buildMe(user.id));
});
