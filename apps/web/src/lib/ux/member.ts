import 'server-only';
import {
  buildJourney,
  eventPhase,
  memberEventActions,
  physicalCardStage,
  CARD_DISPLAY_PRIORITY,
  type CardStateResponse,
  type EventSummary,
  type JourneyStep,
  type MemberEventContext,
  type TappableStep,
} from '@pats/shared';
import { db } from '../db';
import { batchLabel } from '../cards/service';
import { eventInclude, toEventSummary, type EventWithPlace } from '../events/service';
import { getSetting } from '../settings';
import { paymentOf, recorderNames } from './reservations';

export type ActiveMember = { id: string; cityId: string };

/** Everything the member-side rules need for a set of events, in a fixed number of queries. */
export async function memberEventContexts(member: ActiveMember, events: EventWithPlace[], now = new Date()) {
  const ids = events.map((e) => e.id);
  const [checkIns, reservations, claims, roaming, grants] = await Promise.all([
    db.checkIn.findMany({ where: { memberId: member.id, eventId: { in: ids } }, select: { eventId: true, checkedInAt: true, method: true } }),
    db.reservation.findMany({
      where: { memberId: member.id, eventId: { in: ids }, status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { id: true, eventId: true, status: true, slotCode: true, pax: true, updatedAt: true, downPaymentAmount: true, downPaymentAt: true, downPaymentById: true, conversation: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.xpClaim.findMany({ where: { memberId: member.id, eventId: { in: ids }, formType: 'MEMBER' }, select: { id: true, eventId: true, status: true } }),
    db.roamingRequest.findMany({ where: { memberId: member.id, eventId: { in: ids }, type: 'ATTENDANCE' }, select: { eventId: true, status: true, accessExpiresAt: true }, orderBy: { createdAt: 'desc' } }),
    db.roamingRequest.findMany({
      where: { memberId: member.id, type: 'SOCIAL_HUB', status: 'APPROVED', accessExpiresAt: { gt: now } },
      select: { targetCityId: true },
    }),
  ]);
  const hubCities = new Set(grants.map((g) => g.targetCityId));
  const names = await recorderNames(reservations);
  const out = new Map<string, { ctx: MemberEventContext; checkIn: { checkedInAt: Date; method: (typeof checkIns)[number]['method'] } | null; reservation: (typeof reservations)[number] | null }>();
  for (const e of events) {
    const checkIn = checkIns.find((c) => c.eventId === e.id) ?? null;
    const reservation = reservations.find((r) => r.eventId === e.id) ?? null;
    const claim = claims.find((c) => c.eventId === e.id) ?? null;
    const roam = roaming.find((r) => r.eventId === e.id) ?? null;
    const homeCity = e.cityId === member.cityId;
    const roamStatus = roam
      ? roam.status === 'APPROVED' && (!roam.accessExpiresAt || roam.accessExpiresAt <= now)
        ? 'EXPIRED'
        : roam.status
      : null;
    out.set(e.id, {
      checkIn,
      reservation,
      ctx: {
        homeCity,
        cityAccess: homeCity || hubCities.has(e.cityId),
        attendanceRoaming: roamStatus,
        checkedIn: Boolean(checkIn),
        hasVenue: Boolean(e.venueId),
        reservation: reservation ? { id: reservation.id, status: reservation.status as 'PENDING' | 'CONFIRMED' } : null,
        claim: claim ? { id: claim.id, status: claim.status as 'PENDING' | 'APPROVED' | 'REJECTED' } : null,
        drawConfigured: Boolean(e.drawPrize),
      },
    });
  }
  return { contexts: out, recorders: names };
}

type MemberContext = Awaited<ReturnType<typeof memberEventContexts>>['contexts'] extends Map<string, infer V> ? V : never;

function summarize(e: EventWithPlace, c: MemberContext, now: Date): EventSummary {
  return {
    ...toEventSummary(e, { myCheckIn: c.checkIn ? { checkedInAt: c.checkIn.checkedInAt.toISOString(), method: c.checkIn.method } : null }, now),
    isHomeCity: c.ctx.homeCity,
    actions: memberEventActions({ phase: eventPhase(e, now), endsAt: e.endsAt }, c.ctx, now),
  };
}

/** Member summaries: the legacy fields plus actions (F09) and the home-city flag (D5). */
export async function memberSummaries(member: ActiveMember, events: EventWithPlace[], now = new Date()): Promise<EventSummary[]> {
  const { contexts } = await memberEventContexts(member, events, now);
  return events.map((e) => summarize(e, contexts.get(e.id)!, now));
}

/** Event detail for a member: summary + journey + my reservation with its deposit. */
export async function memberEventDetail(member: ActiveMember, event: EventWithPlace, now = new Date()) {
  const { contexts, recorders } = await memberEventContexts(member, [event], now);
  const c = contexts.get(event.id)!;
  const journey = await journeyFor(member, event, c, now);
  const r = c.reservation;
  return {
    event: summarize(event, c, now),
    journey,
    myReservation: r
      ? {
          id: r.id,
          status: r.status as 'PENDING' | 'CONFIRMED',
          slotCode: r.slotCode,
          pax: r.pax,
          conversationId: r.conversation?.id ?? null,
          payment: paymentOf({ ...r, downPaymentBy: r.downPaymentById ? { name: recorders.get(r.downPaymentById) ?? '' } : null }),
        }
      : null,
  };
}

async function journeyFor(
  member: ActiveMember,
  event: EventWithPlace,
  c: { checkIn: { checkedInAt: Date } | null; reservation: { status: string; updatedAt: Date } | null },
  now: Date,
): Promise<JourneyStep[]> {
  const taps = await db.memberEventStep.findMany({ where: { memberId: member.id, eventId: event.id } });
  return buildJourney({
    taps: Object.fromEntries(taps.map((t) => [t.step, t.completedAt])) as Partial<Record<TappableStep, Date>>,
    reservation: c.reservation ? { status: c.reservation.status as 'PENDING' | 'CONFIRMED', updatedAt: c.reservation.updatedAt } : null,
    checkIn: c.checkIn,
    ended: event.endsAt.getTime() <= now.getTime(),
    endsAt: event.endsAt,
    reservationBonusXp: await getSetting(db, 'reservationBonusXp', { cityId: event.cityId }),
  });
}

/** Records a tapped step (idempotent: the first tap's time is kept). */
export async function tapStep(member: ActiveMember, eventId: string, step: TappableStep) {
  await db.memberEventStep.upsert({
    where: { memberId_eventId_step: { memberId: member.id, eventId, step } },
    create: { memberId: member.id, eventId, step },
    update: {},
  });
}

/** The next event in the member's city (or, if none, the next one nationally for "Browse other cities"). */
export async function nextEventFor(member: ActiveMember, now = new Date()) {
  const base = { status: { not: 'DRAFT' as const }, endsAt: { gte: now }, city: { active: true } };
  const home = await db.event.findFirst({ where: { ...base, cityId: member.cityId }, orderBy: { startsAt: 'asc' }, include: eventInclude });
  if (home) return { event: home, national: false };
  const other = await db.event.findFirst({ where: base, orderBy: { startsAt: 'asc' }, include: eventInclude });
  return { event: other, national: Boolean(other) };
}

/** Digital readiness vs physical card (D3): the QR never waits for printing. */
export async function cardState(memberId: string): Promise<CardStateResponse> {
  const m = await db.member.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { status: true } },
      cards: { include: { batch: { select: { number: true, shippedToCityAt: true, city: { select: { code: true } } } } }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!m) return { digital: { ready: false, reason: 'noMembership' }, physical: null, face: null };
  const active = m.status === 'ACTIVE' && m.user.status === 'ACTIVE';
  const card = CARD_DISPLAY_PRIORITY.map((s) => m.cards.find((c) => c.status === s)).find(Boolean) ?? null;
  return {
    digital: { ready: active, reason: active ? null : 'memberInactive' },
    physical: card
      ? {
          status: card.status,
          stage: physicalCardStage(card.status, Boolean(card.batch?.shippedToCityAt)),
          batchLabel: card.batch ? batchLabel(card.batch.city.code, card.batch.number) : null,
          shippedToCityAt: card.batch?.shippedToCityAt?.toISOString() ?? null,
          deliveredAt: card.deliveredAt?.toISOString() ?? null,
          replacementFee: card.replacementFee !== null ? { amount: card.replacementFee, paidAt: card.feePaidAt?.toISOString() ?? null } : null,
        }
      : { status: 'NOT_PRINTED', stage: 'queued', batchLabel: null, shippedToCityAt: null, deliveredAt: null, replacementFee: null },
    face: { name: m.fullName, favoriteDrink: m.favoriteDrink, quote: m.quotes },
  };
}

/** The member's unpaid live reservation that blocks a new booking, if any (UX19). */
export async function blockingReservation(memberId: string) {
  return db.reservation.findFirst({
    where: { memberId, downPaymentAt: null, status: { in: ['PENDING', 'CONFIRMED'] } },
    select: { id: true, status: true, slotCode: true, event: { select: { id: true, title: true } }, conversation: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
