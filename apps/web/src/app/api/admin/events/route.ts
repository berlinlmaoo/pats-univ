import type { EventDetailResponse, EventListResponse } from '@pats/shared';
import { requireCrew } from '@/lib/auth/roles';
import { crewEventScope, parseCrewEventInput, withCheckInCounts } from '@/lib/events/crew-api';
import { createEvent, listEvents, toEventSummary } from '@/lib/events/service';
import { ok, readJson, route } from '@/lib/http/respond';

/** Crew: every event of their city, drafts included, with check-in counts. */
export const GET = route(async (req: Request) => {
  const admin = await requireCrew(req);
  const now = new Date();
  const { upcoming, past } = await listEvents(crewEventScope(admin), now);
  const body: EventListResponse = {
    upcoming: await withCheckInCounts(upcoming, now),
    past: await withCheckInCounts(past, now),
  };
  return ok(body);
});

export const POST = route(async (req: Request) => {
  const admin = await requireCrew(req);
  const fields = parseCrewEventInput(admin, await readJson(req));
  const event = await createEvent(admin, fields);
  const body: EventDetailResponse = { event: toEventSummary(event, { checkInCount: 0 }) };
  return ok(body, { status: 201 });
});
