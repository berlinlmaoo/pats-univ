import 'server-only';
import {
  can,
  eventPhase,
  eventTimingInfo,
  roamingExpiry,
  eventTimesFromInput,
  toZonedInput,
  type EventAction,
  type EventFields,
  type EventSummary,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { atomic } from '../loyalty/transaction';
import { getSetting } from '../settings';
import { publish } from '../social/realtime';
import { audit } from '../audit';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { notifyContentSubmitted, posterUrlOf, submitContent } from './content';

export const eventInclude = {
  city: { select: { id: true, code: true, name: true, timezone: true } },
  venue: { select: { id: true, name: true, address: true } },
} satisfies Prisma.EventInclude;

export type EventWithPlace = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

export function toEventSummary(
  e: EventWithPlace,
  extra: Pick<EventSummary, 'myCheckIn' | 'checkInCount'> = {},
  now = new Date(),
): EventSummary {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    city: e.city,
    venue: e.venue,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    checkInOpensAt: e.checkInOpensAt.toISOString(),
    checkInClosesAt: e.checkInClosesAt.toISOString(),
    status: e.status,
    phase: eventPhase(e, now),
    capacity: e.capacity,
    // Served by /api/events/:id/flyer; the version busts caches when HQ replaces it.
    flyerUrl: posterUrlOf(e),
    timing: eventTimingInfo(e, e.city.timezone, now),
    poster: { url: posterUrlOf(e), description: e.description },
    ...extra,
  };
}

/** Form values for editing, in the city's wall-clock time. */
export function toEventFormValues(e: EventWithPlace) {
  const start = toZonedInput(e.startsAt, e.city.timezone);
  const end = toZonedInput(e.endsAt, e.city.timezone);
  const opensBefore = Math.round((e.startsAt.getTime() - e.checkInOpensAt.getTime()) / 60_000);
  return {
    title: e.title,
    description: e.description,
    cityId: e.cityId,
    venueId: e.venueId ?? '',
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    opensBeforeMinutes: Math.min(720, Math.max(0, opensBefore)),
    capacity: e.capacity,
    publish: e.status !== 'DRAFT',
  };
}

async function resolvePlace(actor: AuthUser, fields: EventFields) {
  const city = await db.city.findUnique({ where: { id: fields.cityId } });
  if (!city) throw new AppError('VALIDATION', 422, 'Unknown city', { fields: { cityId: 'errors.cityNotFound' } });
  requireCityAccess(actor, city.id);
  if (fields.venueId) {
    const venue = await db.venue.findFirst({ where: { id: fields.venueId, cityId: city.id } });
    if (!venue) throw new AppError('VALIDATION', 422, 'Venue not in city', { fields: { venueId: 'validation.invalid' } });
  }
  const times = eventTimesFromInput(fields, city.timezone);
  if (!times) throw new AppError('VALIDATION', 422, 'Bad times', { fields: { date: 'validation.dateInvalid' } });
  return { city, times };
}

/**
 * HQ for any city, a city admin for their own. Members never reach this. A regional admin's
 * description goes to HQ for approval (UX redesign D5): the event starts without one.
 */
export async function createEvent(actor: AuthUser, fields: EventFields): Promise<EventWithPlace> {
  const { city, times } = await resolvePlace(actor, fields);
  const direct = can(actor.role, 'hq.manage');
  const { event, submission } = await atomic(async (tx) => {
    const event = await tx.event.create({
      data: {
        cityId: city.id,
        venueId: fields.venueId || null,
        title: fields.title,
        description: direct ? fields.description : '',
        capacity: fields.capacity ?? null,
        ...times,
        status: fields.publish ? 'PUBLISHED' : 'DRAFT',
        createdById: actor.id,
      },
      include: eventInclude,
    });
    const submission = !direct && fields.description ? await submitContent(tx, actor, event.id, { description: fields.description, posterKey: null }) : null;
    return { event, submission };
  });
  await audit(actor.id, 'event.created', { type: 'Event', id: event.id }, { cityId: city.id, status: event.status });
  if (submission) await notifyContentSubmitted(submission);
  return event;
}

export async function updateEvent(actor: AuthUser, id: string, fields: EventFields): Promise<EventWithPlace> {
  const { city, times } = await resolvePlace(actor, fields);
  const direct = can(actor.role, 'hq.manage');
  const { updated: event, submission } = await atomic(async tx => {
    const existing = await tx.event.findUnique({ where: { id }, include: { _count: { select: { checkIns: true, reservations: true, roamingRequests: true } } } });
    if (!existing) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(actor, existing.cityId);
    if (existing.cityId !== fields.cityId && (existing._count.checkIns || existing._count.reservations || existing._count.roamingRequests)) {
      throw new AppError('VALIDATION', 422, 'City locked', { fields: { cityId: 'events.cityLocked' } });
    }
    if (existing.venueId !== (fields.venueId || null) && existing._count.reservations) throw new AppError('SLOT_TAKEN', 409);
    const status = existing.status === 'DRAFT' && fields.publish ? 'PUBLISHED' : existing.status === 'PUBLISHED' && !fields.publish && !existing._count.checkIns && !existing._count.reservations && !existing._count.roamingRequests ? 'DRAFT' : existing.status;
    // A regional admin's description change waits for HQ (D5); everything else saves as before.
    const descriptionChanged = fields.description !== existing.description;
    const submission = !direct && descriptionChanged ? await submitContent(tx, actor, id, { description: fields.description, posterKey: null }) : null;
    const updated = await tx.event.update({ where: { id }, data: { cityId: city.id, venueId: fields.venueId || null, title: fields.title, description: direct ? fields.description : existing.description, capacity: fields.capacity ?? null, ...times, status }, include: eventInclude });
    const hours = await getSetting(tx, 'roamingHubExpiryHours');
    for (const type of ['ATTENDANCE', 'SOCIAL_HUB'] as const) {
      await tx.roamingRequest.updateMany({ where: { eventId: id, type, status: 'APPROVED' }, data: { accessExpiresAt: roamingExpiry(updated.endsAt, type, hours) } });
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'event.updated', targetType: 'Event', targetId: id, meta: { status } } });
    return { updated, submission };
  });
  await publish({ kind: 'attendance', id });
  if (submission) await notifyContentSubmitted(submission);
  return event;
}

/**
 * publish: DRAFT -> PUBLISHED. open: any -> OPEN; opening before the planned window starts it
 * now, opening after it ended is refused. close: OPEN -> CLOSED (check-ins are kept).
 */
export async function transitionEvent(actor: AuthUser, id: string, action: EventAction, now = new Date()): Promise<EventWithPlace> {
  const existing = await db.event.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(actor, existing.cityId);

  let data: Prisma.EventUpdateInput;
  let meta: Prisma.InputJsonValue = { from: existing.status };
  switch (action) {
    case 'publish':
      if (existing.status !== 'DRAFT') return db.event.findUniqueOrThrow({ where: { id }, include: eventInclude });
      data = { status: 'PUBLISHED' };
      break;
    case 'open':
      if (now.getTime() >= existing.checkInClosesAt.getTime()) throw new AppError('EVENT_ENDED', 409);
      data = { status: 'OPEN' };
      if (now.getTime() < existing.checkInOpensAt.getTime()) {
        data.checkInOpensAt = now;
        meta = { ...meta, openedEarly: true, plannedOpensAt: existing.checkInOpensAt.toISOString() };
      }
      break;
    case 'close':
      if (existing.status !== 'OPEN') return db.event.findUniqueOrThrow({ where: { id }, include: eventInclude });
      data = { status: 'CLOSED' };
      break;
  }
  const event = await db.event.update({ where: { id }, data, include: eventInclude });
  await audit(actor.id, `event.${action === 'open' ? 'opened' : action === 'close' ? 'closed' : 'published'}`, { type: 'Event', id }, meta);
  await publish({ kind: 'attendance', id });
  return event;
}

/** Events a list shows: upcoming (not ended yet) soonest first, then recent past events. */
export async function listEvents(where: Prisma.EventWhereInput, now = new Date(), pastLimit = 20) {
  const [upcoming, past] = await Promise.all([
    db.event.findMany({ where: { ...where, endsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, include: eventInclude, take: 50 }),
    db.event.findMany({ where: { ...where, endsAt: { lt: now } }, orderBy: { startsAt: 'desc' }, include: eventInclude, take: pastLimit }),
  ]);
  return { upcoming, past };
}
