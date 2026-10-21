import 'server-only';
import {
  can,
  CHECK_IN_METHODS,
  eventPhase,
  FDC_PENDING,
  type AdminScope,
  type CheckInMethod,
  type NotificationTarget,
  type WorkCount,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { eventContent } from '../events/content';
import { withCheckInCounts } from '../events/crew-api';
import { eventInclude, type EventWithPlace } from '../events/service';
import { AppError } from '../http/errors';
import { drawState } from '../loyalty/draw';
import { reservationCards, soldByEvent } from './reservations';

/** Shown next to the Admin mode switch (D1): "Regional Admin · Jakarta" or "HQ, all cities". */
export async function adminScope(user: { role: AuthUser['role']; cityId: string | null }): Promise<AdminScope | null> {
  if (!can(user.role, 'city.operations')) return null;
  if (can(user.role, 'hq.manage')) return { kind: 'HQ', city: null };
  const city = user.cityId ? await db.city.findUnique({ where: { id: user.cityId }, select: { id: true, code: true, name: true } }) : null;
  return { kind: 'CITY', city };
}

function requireStaff(user: AuthUser) {
  if (!can(user.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  const hq = can(user.role, 'hq.manage');
  if (!hq && !user.cityId) throw new AppError('FORBIDDEN', 403);
  return { hq, cityId: hq ? undefined : user.cityId! };
}

const target = (screen: NotificationTarget['screen'], extra: Partial<NotificationTarget> = {}, actionKey = 'open'): NotificationTarget => ({
  screen,
  requiresAdminMode: true,
  actionKey: `ux.notifAction.${actionKey}`,
  ...extra,
});

/**
 * Admin-mode Home (UX23, F14): the work city, the event to scan now (or the next one and when it
 * opens, UX24/F16), and pending queues, each with its canonical destination.
 */
export async function adminHome(user: AuthUser, now = new Date()) {
  const { hq, cityId } = requireStaff(user);
  const eventScope: Prisma.EventWhereInput = { cityId, status: { not: 'DRAFT' }, city: { active: true } };
  const [scope, live, recentEnded] = await Promise.all([
    adminScope(user),
    db.event.findMany({ where: { ...eventScope, endsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, include: eventInclude, take: 20 }),
    db.event.findMany({
      where: { ...eventScope, endsAt: { lt: now, gte: new Date(now.getTime() - 30 * 86400_000) } },
      select: { id: true, recap: { select: { id: true } } },
    }),
  ]);
  const open = live.filter((e) => eventPhase(e, now) === 'open');
  const next = live.find((e) => eventPhase(e, now) === 'upcoming') ?? null;
  const eventCity = cityId ? { event: { cityId } } : {};
  const [claims, reservations, deposits, roaming, hubAccess, reencode, regionChanges, content] = await Promise.all([
    db.xpClaim.count({ where: { status: 'PENDING', ...eventCity } }),
    db.reservation.count({ where: { status: 'PENDING', ...eventCity } }),
    db.reservation.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, downPaymentAt: null, ...eventCity } }),
    db.roamingRequest.count({ where: { status: 'PENDING', type: 'ATTENDANCE', ...(cityId ? { targetCityId: cityId } : {}) } }),
    hq ? db.roamingRequest.count({ where: { status: 'PENDING', type: 'SOCIAL_HUB' } }) : Promise.resolve(0),
    hq ? db.reencodeRequest.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    hq ? db.regionChangeRequest.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    db.eventContentSubmission.count({ where: { status: 'PENDING', ...(hq ? {} : { submittedById: user.id }) } }),
  ]);
  const recapsDue = recentEnded.filter((e) => !e.recap).length;
  const pending: Record<string, WorkCount> = {
    claims: { count: claims, target: target('adminClaims', {}, 'reviewClaim') },
    reservations: { count: reservations, target: target('adminReservations', {}, 'reviewBooking') },
    deposits: { count: deposits, target: target('adminReservations', {}, 'reviewBooking') },
    roaming: { count: roaming, target: target('adminRoaming', {}, 'reviewRequest') },
    recapsDue: { count: recapsDue, target: target('adminEvent', {}, 'open') },
    ...(hq
      ? {
          hubAccess: { count: hubAccess, target: target('adminRoaming', {}, 'reviewRequest') },
          reencode: { count: reencode, target: target('adminMemberCard', {}, 'open') },
          regionChanges: { count: regionChanges, target: target('notifications', {}, 'open') },
          content: { count: content, target: target('adminContentQueue', {}, 'reviewPoster') },
        }
      : { myContent: { count: content, target: target('adminContentQueue', {}, 'viewPoster') } }),
  };
  const [openSummaries, nextSummary] = await Promise.all([withCheckInCounts(open, now), next ? withCheckInCounts([next], now) : Promise.resolve([])]);
  return {
    scope,
    serverTime: now.toISOString(),
    /** Events whose check-in window is open now: the scan picker (UX24). */
    openEvents: openSummaries,
    /** When nothing is open: the next event and its timing (checkInOpensAt), so staff know when. */
    nextEvent: nextSummary[0] ?? null,
    pending,
  };
}

async function staffEvent(user: AuthUser, eventId: string): Promise<EventWithPlace> {
  requireStaff(user);
  const event = await db.event.findUnique({ where: { id: eventId }, include: eventInclude });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(user, event.cityId);
  return event;
}

/** What each lifecycle control would do right now (UX25, F18): offer only those that apply. */
export function lifecycleActions(e: EventWithPlace, now = new Date()) {
  const phase = eventPhase(e, now);
  const ended = now.getTime() >= e.checkInClosesAt.getTime();
  return {
    phase,
    canPublish: e.status === 'DRAFT',
    /** Opening before the planned window starts check-in immediately (openEarly). */
    canOpen: e.status !== 'OPEN' && !ended,
    openEarly: e.status !== 'OPEN' && !ended && now.getTime() < e.checkInOpensAt.getTime(),
    canClose: e.status === 'OPEN' && !ended,
    canScan: phase === 'open',
    /** Why Scan isn't offered: checkInNotOpen (with checkInOpensAt) or checkInEnded (with checkInClosesAt). */
    scanUnavailable: phase === 'open' ? null : ended || phase === 'ended' ? ('checkInEnded' as const) : ('checkInNotOpen' as const),
    checkInOpensAt: e.checkInOpensAt.toISOString(),
    checkInClosesAt: e.checkInClosesAt.toISOString(),
  };
}

/**
 * One event workspace (D6, UX26, F25): overview, attendance, reservations (sold table vs sofa),
 * claims, draw, recap and the poster/description, with the event always in context.
 */
export async function eventWorkspace(user: AuthUser, eventId: string, now = new Date()) {
  const event = await staffEvent(user, eventId);
  const [[summary], byMethod, reservationGroups, sold, claimGroups, roamingPending, recap, draw, content, rewardsFulfilled] = await Promise.all([
    withCheckInCounts([event], now),
    db.checkIn.groupBy({ by: ['method'], where: { eventId }, _count: { _all: true } }),
    db.reservation.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
    soldByEvent([eventId]),
    db.xpClaim.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
    db.roamingRequest.count({ where: { eventId, status: 'PENDING', type: 'ATTENDANCE' } }),
    db.trafficRecap.findUnique({ where: { eventId } }),
    drawState(user, eventId),
    eventContent(user, eventId),
    db.redemption.count({ where: { eventId, status: 'FULFILLED' } }),
  ]);
  const methods = Object.fromEntries(CHECK_IN_METHODS.map((m) => [m, 0])) as Record<CheckInMethod, number>;
  for (const g of byMethod) methods[g.method] = g._count._all;
  const reservations = Object.fromEntries(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'].map((s) => [s, 0])) as Record<string, number>;
  for (const g of reservationGroups) reservations[g.status] = g._count._all;
  const claims = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
  for (const g of claimGroups) claims[g.status] = g._count._all;
  const unpaid = await db.reservation.count({ where: { eventId, status: { in: ['PENDING', 'CONFIRMED'] }, downPaymentAt: null } });
  const soldSplit = sold.get(eventId)!;
  return {
    event: summary!,
    lifecycle: lifecycleActions(event, now),
    attendance: { count: summary!.checkInCount ?? 0, byMethod: methods, capacity: event.capacity },
    reservations: { byStatus: reservations, unpaidDeposits: unpaid, sold: soldSplit },
    claims: { byStatus: claims },
    roaming: { pending: roamingPending },
    rewards: { fulfilled: rewardsFulfilled },
    draw,
    recap: {
      saved: recap
        ? {
            sofaCount: recap.sofaCount,
            tableCount: recap.tableCount,
            fdcCount: recap.fdcCount,
            paxCount: recap.paxCount,
            revenueSofa: recap.revenueSofa,
            revenueTable: recap.revenueTable,
            revenueFdc: recap.revenueFdc,
            total: recap.total,
            personInCharge: recap.personInCharge,
            accountablePerson: recap.accountablePerson,
            note: recap.note,
            lockedAt: recap.lockedAt?.toISOString() ?? null,
          }
        : null,
      /** System counts from confirmed reservations (not typed by staff). */
      reservationsSold: soldSplit,
      /** FDC's definition is pending with the owner: always null, never derived. */
      fdcSold: FDC_PENDING,
      due: event.endsAt.getTime() <= now.getTime() && !recap,
      canLock: can(user.role, 'hq.manage'),
    },
    content,
  };
}

/** The event's reservations as cards (poster highlight, slot kind, deposit), newest first. */
export async function eventReservations(user: AuthUser, eventId: string, status?: string) {
  const event = await staffEvent(user, eventId);
  const allowed = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'];
  const where: Prisma.ReservationWhereInput = { eventId: event.id, ...(status && allowed.includes(status) ? { status: status as 'PENDING' } : {}) };
  return { reservations: await reservationCards(where, 200), sold: (await soldByEvent([event.id])).get(event.id)! };
}

/** Staff draw (UX30): staff event context + draw state, never the member-only event endpoint. */
export async function staffDraw(user: AuthUser, eventId: string, now = new Date()) {
  if (!can(user.role, 'draw.manage')) throw new AppError('FORBIDDEN', 403);
  const event = await staffEvent(user, eventId);
  const [[summary], draw] = await Promise.all([withCheckInCounts([event], now), drawState(user, eventId)]);
  const ended = event.endsAt.getTime() <= now.getTime();
  return {
    event: summary!,
    draw,
    /** Run only when the event is open, not yet drawn, the prize is set and every slot is taken. */
    canRun: !draw.startedAt && !ended && event.status === 'OPEN' && event.startsAt.getTime() <= now.getTime() && Boolean(draw.prize) && draw.entries.length === draw.capacity,
    canConfigure: !draw.startedAt && draw.entries.length === 0 && !ended,
  };
}

