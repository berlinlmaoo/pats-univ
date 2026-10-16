import { eventActionSchema, type EventDetailResponse } from '@pats/shared';
import { requireCrew } from '@/lib/auth/roles';
import { withCheckInCounts } from '@/lib/events/crew-api';
import { transitionEvent } from '@/lib/events/service';
import { ok, readJson, route } from '@/lib/http/respond';

/** publish | open | close. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireCrew(req);
  const { id } = await params;
  const { action } = eventActionSchema.parse(await readJson(req));
  const event = await transitionEvent(admin, id, action);
  const [summary] = await withCheckInCounts([event]);
  const body: EventDetailResponse = { event: summary! };
  return ok(body);
});
