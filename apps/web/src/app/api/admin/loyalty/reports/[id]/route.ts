import { requireCrew } from '@/lib/auth/roles';
import { AppError } from '@/lib/http/errors';
import { route } from '@/lib/http/respond';
export const POST = route(async (req: Request) => { await requireCrew(req); throw new AppError('FORBIDDEN', 403); });
