import { z } from 'zod';
import { requireCrew } from '@/lib/auth/roles';
import { AppError } from '@/lib/http/errors';
import { ok, route, readJson } from '@/lib/http/respond';
import { configureDraw, runDraw, assignFreeCredit, grantQuarterWinners } from '@/lib/loyalty/draw';
import { staffDraw } from '@/lib/ux/staff';

/**
 * Staff draw state (UX30): the staff event summary + draw, authorized by draw.manage and the city.
 * Staff screens use this instead of the member-only GET /api/events/:id (which stays member-only).
 */
export const GET = route(async (req: Request) => {
  const user = await requireCrew(req);
  const eventId = new URL(req.url).searchParams.get('eventId');
  if (!eventId) throw new AppError('VALIDATION', 422, 'eventId required', { fields: { eventId: 'validation.required' } });
  await grantQuarterWinners();
  return ok(await staffDraw(user, eventId));
});

export const POST = route(async (req: Request) => {
  const user = await requireCrew(req);
  const input = z.object({ action: z.enum(['configure', 'run', 'assign']), eventId: z.string(), creditId: z.string().optional() }).passthrough().parse(await readJson(req));
  if (input.action === 'configure') await configureDraw(user, input);
  if (input.action === 'run') await runDraw(user, input.eventId);
  if (input.action === 'assign') await assignFreeCredit(user, z.string().min(1).parse(input.creditId), input.eventId);
  return ok({ saved: true });
});
