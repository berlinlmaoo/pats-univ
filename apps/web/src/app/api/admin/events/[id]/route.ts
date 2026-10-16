import type { EventDetailResponse } from '@pats/shared';
import { requireCityAccess } from '@/lib/auth/current-user';
import { requireCrew } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { parseCrewEventInput, withCheckInCounts } from '@/lib/events/crew-api';
import { eventInclude, toEventFormValues, updateEvent } from '@/lib/events/service';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';

type Ctx = { params: Promise<{ id: string }> };

/** Event detail plus the values to prefill the edit form. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const admin = await requireCrew(req);
  const { id } = await params;
  const event = await db.event.findUnique({ where: { id }, include: eventInclude });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(admin, event.cityId);
  const [summary] = await withCheckInCounts([event]);
  return ok({ event: summary!, form: toEventFormValues(event) });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const admin = await requireCrew(req);
  const { id } = await params;
  const fields = parseCrewEventInput(admin, await readJson(req));
  const event = await updateEvent(admin, id, fields);
  const [summary] = await withCheckInCounts([event]);
  const body: EventDetailResponse = { event: summary! };
  return ok(body);
});
