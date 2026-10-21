import { requireCrew } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { adminHome } from '@/lib/ux/staff';

/** Admin-mode Home (UX23, UX24, F14, F16): scope, open/next event to scan and pending queues. */
export const GET = route(async (req: Request) => ok(await adminHome(await requireCrew(req))));
