import { requireApiUser } from '@/lib/auth/current-user';
import { AppError } from '@/lib/http/errors';
import { route } from '@/lib/http/respond';
const retired = route(async (req: Request) => {
  await requireApiUser(req);
  throw new AppError('FORBIDDEN', 403, 'PR recaps are entered by the regional team');
});
export const GET = retired;
export const POST = retired;
