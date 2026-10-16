import { can } from '@pats/shared';
import 'server-only';
import { eventInputSchema, type EventSummary } from '@pats/shared';
import type { AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { type EventWithPlace, toEventSummary } from './service';

/** City admins only ever work in their own city; the form doesn't even send it. */
export function parseCrewEventInput(admin: AuthUser, raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cityId = can(admin.role, 'hq.manage') ? body.cityId : admin.cityId;
  return eventInputSchema.parse({ ...body, cityId });
}

export function crewEventScope(admin: AuthUser) {
  if (can(admin.role, 'hq.manage')) return {};
  if (!admin.cityId) throw new AppError('FORBIDDEN', 403);
  return { cityId: admin.cityId };
}

export async function withCheckInCounts(events: EventWithPlace[], now = new Date()): Promise<EventSummary[]> {
  const counts = await db.checkIn.groupBy({
    by: ['eventId'],
    where: { eventId: { in: events.map((e) => e.id) } },
    _count: { _all: true },
  });
  const byEvent = new Map(counts.map((c) => [c.eventId, c._count._all]));
  return events.map((e) => toEventSummary(e, { checkInCount: byEvent.get(e.id) ?? 0 }, now));
}
