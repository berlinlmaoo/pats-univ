import { describe, expect, it } from 'vitest';
import {
  buildJourney,
  contentDecisionSchema,
  EVENT_REPORT_FIELDS,
  eventReportInput,
  fdcFromReport,
  posterProofDecisionSchema,
  sumReports,
  countSold,
  createTranslator,
  dictionaries,
  eventTimingInfo,
  journeyTapSchema,
  memberEventActions,
  notificationTarget,
  physicalCardStage,
  roamingSchema,
  type MemberEventContext,
} from '../src';

const base: MemberEventContext = {
  homeCity: true,
  cityAccess: true,
  attendanceRoaming: null,
  checkedIn: false,
  hasVenue: true,
  reservation: null,
  claim: null,
  drawConfigured: false,
};
const byKey = (list: ReturnType<typeof memberEventActions>) => Object.fromEntries(list.map((a) => [a.key, a]));
const now = new Date('2026-10-25T13:00:00Z');
const later = new Date('2026-10-25T20:00:00Z');
const earlier = new Date('2026-10-25T10:00:00Z');

describe('member event actions (F09)', () => {
  it('offers QR only while check-in is open, and never roaming in the home city (UX07)', () => {
    const open = byKey(memberEventActions({ phase: 'open', endsAt: later }, base, now));
    expect(open.showQr).toMatchObject({ available: true, reason: null });
    expect(open.roaming).toMatchObject({ available: false, reason: 'homeCity' });
    expect(open.reserve!.available).toBe(true);
    const upcoming = byKey(memberEventActions({ phase: 'upcoming', endsAt: later }, base, now));
    expect(upcoming.showQr!.reason).toBe('checkInNotOpen');
  });

  it('needs approved attendance roaming for another city before showing the QR', () => {
    const away = { ...base, homeCity: false, cityAccess: false };
    const a = byKey(memberEventActions({ phase: 'open', endsAt: later }, away, now));
    expect(a.showQr!.reason).toBe('roamingRequired');
    expect(a.roaming!.available).toBe(true);
    expect(a.reserve!.reason).toBe('noCityAccess');
    const approved = byKey(memberEventActions({ phase: 'open', endsAt: later }, { ...away, attendanceRoaming: 'APPROVED' }, now));
    expect(approved.showQr!.available).toBe(true);
  });

  it('after the event: claim XP instead of forward-looking actions (UX09)', () => {
    const ended = byKey(memberEventActions({ phase: 'ended', endsAt: earlier }, { ...base, checkedIn: true }, now));
    expect(ended.showQr!.reason).toBe('alreadyCheckedIn');
    expect(ended.reserve!.reason).toBe('eventEnded');
    expect(ended.claimXp!.available).toBe(true);
    const claimed = byKey(memberEventActions({ phase: 'ended', endsAt: earlier }, { ...base, claim: { id: 'c', status: 'PENDING' } }, now));
    expect(claimed.claimXp!.reason).toBe('claimSubmitted');
  });

  it('one live reservation per event', () => {
    const a = byKey(memberEventActions({ phase: 'upcoming', endsAt: later }, { ...base, reservation: { id: 'r', status: 'PENDING' } }, now));
    expect(a.reserve!.reason).toBe('reservationExists');
  });
});

describe('Home journey (D4, blast poster 22 Oct)', () => {
  const input = { taps: {}, reservation: null, checkIn: null, ended: false, endsAt: later, reservationBonusXp: 25, posterShareXp: 2 };
  const proof = (status: 'PENDING' | 'APPROVED' | 'REJECTED') => ({ id: 'p', status, imageUrl: '/x', submittedAt: earlier.toISOString(), reviewedAt: status === 'PENDING' ? null : earlier.toISOString(), rejectReason: status === 'REJECTED' ? 'blurry' : null, xpAwarded: status === 'APPROVED' ? 2 : null });
  it('poster is optional and never current; check-in comes from the server', () => {
    const steps = buildJourney(input);
    expect(steps.map((s) => s.key)).toEqual(['event', 'poster', 'reservation', 'checkIn', 'completed']);
    expect(steps.map((s) => s.state)).toEqual(['current', 'optional', 'upcoming', 'upcoming', 'upcoming']);
    expect(steps[1]).toMatchObject({ completion: 'review', optional: true, rewardXp: 2 });
    expect(steps[1]).not.toHaveProperty('pending');
    expect(steps[3]!.completion).toBe('server');
  });

  it('skipping or an open poster never blocks the next step', () => {
    const open = buildJourney({ ...input, taps: { event: earlier } });
    expect(open[1]!.state).toBe('optional');
    expect(open[2]!.state).toBe('current');
    const skipped = buildJourney({ ...input, taps: { event: earlier, poster: earlier } });
    expect(skipped[1]).toMatchObject({ state: 'done', outcome: 'skipped' });
  });

  it('poster follows the proof review', () => {
    expect(buildJourney({ ...input, posterProof: proof('PENDING') })[1]).toMatchObject({ state: 'optional', outcome: 'submitted' });
    expect(buildJourney({ ...input, posterProof: proof('REJECTED') })[1]).toMatchObject({ state: 'optional', outcome: 'rejected' });
    expect(buildJourney({ ...input, posterProof: proof('APPROVED') })[1]).toMatchObject({ state: 'done', outcome: 'approved' });
  });

  it('a confirmed reservation completes its step; a pending one stays current', () => {
    const taps = { event: earlier };
    const confirmed = buildJourney({ ...input, taps, reservation: { status: 'CONFIRMED', updatedAt: earlier } });
    expect(confirmed[2]).toMatchObject({ state: 'done', outcome: 'reserved', bonusXp: 25 });
    expect(confirmed[3]!.state).toBe('current');
    const pending = buildJourney({ ...input, taps, reservation: { status: 'PENDING', updatedAt: earlier } });
    expect(pending[2]).toMatchObject({ state: 'current', outcome: 'requested' });
    const skipped = buildJourney({ ...input, taps: { ...taps, reservation: earlier } });
    expect(skipped[2]).toMatchObject({ state: 'done', outcome: 'skipped' });
  });

  it('completed only after a check-in and the event end', () => {
    const steps = buildJourney({ ...input, taps: { event: earlier, reservation: earlier }, checkIn: { checkedInAt: earlier }, ended: true });
    expect(steps.filter((s) => !s.optional).every((s) => s.state === 'done')).toBe(true);
  });

  it('only event, poster (skip) and reservation can be tapped', () => {
    expect(journeyTapSchema.safeParse({ eventId: 'e', step: 'poster' }).success).toBe(true);
    expect(journeyTapSchema.safeParse({ eventId: 'e', step: 'checkIn' }).success).toBe(false);
    expect(journeyTapSchema.safeParse({ eventId: 'e', step: 'completed' }).success).toBe(false);
  });
});

describe('event report (22 Oct)', () => {
  const full = { tablesSold: 3, sofasSold: 2, fdcSold: 40, paxTotal: 120, membersAttended: 70, nonMembersAttended: 50, newMembers: 8 };
  it('requires all seven non-negative integers', () => {
    expect(eventReportInput.safeParse(full).success).toBe(true);
    expect(eventReportInput.safeParse({ ...full, fdcSold: undefined }).success).toBe(false);
    expect(eventReportInput.safeParse({ ...full, paxTotal: -1 }).success).toBe(false);
    expect(eventReportInput.safeParse({ ...full, newMembers: 1.5 }).success).toBe(false);
  });
  it('FDC comes from the report; sums add up', () => {
    expect(fdcFromReport(null)).toEqual({ value: null, status: 'notReported' });
    expect(fdcFromReport(full)).toEqual({ value: 40, status: 'reported' });
    expect(sumReports([full, full])).toMatchObject({ fdcSold: 80, paxTotal: 240, newMembers: 16 });
    expect(EVENT_REPORT_FIELDS).toHaveLength(7);
  });
  it('a rejected poster proof needs a reason', () => {
    expect(posterProofDecisionSchema.safeParse({ decision: 'REJECTED', reason: '' }).success).toBe(false);
    expect(posterProofDecisionSchema.safeParse({ decision: 'APPROVED' }).success).toBe(true);
  });
});

describe('timing labels (UX08)', () => {
  it('flags overnight events and the next boundary', () => {
    const e = {
      startsAt: new Date('2026-10-25T15:00:00Z'), // 22:00 WIB
      endsAt: new Date('2026-10-25T20:00:00Z'), // 03:00 WIB next day
      checkInOpensAt: new Date('2026-10-25T14:00:00Z'),
      checkInClosesAt: new Date('2026-10-25T20:00:00Z'),
    };
    const t = eventTimingInfo(e, 'Asia/Jakarta', now);
    expect(t.overnight).toBe(true);
    expect(t.opensBeforeMinutes).toBe(60);
    expect(t.next).toEqual({ kind: 'checkInOpens', at: '2026-10-25T14:00:00.000Z' });
    expect(eventTimingInfo(e, 'Asia/Jakarta', new Date('2026-10-26T00:00:00Z')).next).toBeNull();
  });
});

describe('card stages (D3, F07)', () => {
  it('ENCODED is only "shipped" once the batch was shipped to the city', () => {
    expect(physicalCardStage('ENCODED', false)).toBe('encoded');
    expect(physicalCardStage('ENCODED', true)).toBe('shipped');
    expect(physicalCardStage('NOT_PRINTED', false)).toBe('queued');
    expect(physicalCardStage('REVOKED', true)).toBe('inactive');
  });
});

describe('reservations sold (D6)', () => {
  it('splits confirmed reservations by slot kind; unknown slots count as other', () => {
    const sold = countSold(
      [{ slotCode: 'T1', pax: 4 }, { slotCode: 'S1', pax: 6 }, { slotCode: 'S2', pax: 5 }, { slotCode: 'X9', pax: 2 }],
      [{ code: 'T1', kind: 'TABLE' }, { code: 'S1', kind: 'SOFA' }, { code: 'S2', kind: 'SOFA' }],
    );
    expect(sold).toEqual({ table: 1, sofa: 2, other: 1, total: 4, pax: 17 });
  });
});

describe('notification targets (UX22, F32)', () => {
  it('routes staff work to Admin mode and member updates to their record', () => {
    expect(notificationTarget('reservationRequested', { screen: 'social-operations', reservationId: 'r1', eventId: 'e1' })).toMatchObject({
      screen: 'adminReservations',
      reservationId: 'r1',
      eventId: 'e1',
      requiresAdminMode: true,
      actionKey: 'ux.notifAction.reviewBooking',
    });
    expect(notificationTarget('reservationDecided', { screen: 'reservations' })).toMatchObject({ screen: 'reservation', requiresAdminMode: false });
    expect(notificationTarget('claimDecided', { screen: 'claims', claimId: 'c1' })).toMatchObject({ screen: 'claims', claimId: 'c1' });
    expect(notificationTarget('reminder1d', { screen: 'event', eventId: 'e2' })).toMatchObject({ screen: 'event', eventId: 'e2', actionKey: 'ux.notifAction.viewEvent' });
    expect(notificationTarget('reencodeApproved', { screen: 'memberCard', memberId: 'm1' })).toMatchObject({ screen: 'adminMemberCard', memberId: 'm1', requiresAdminMode: true });
  });

  it('old rows without a known kind still get a destination', () => {
    expect(notificationTarget('somethingNew', { screen: 'card' }).screen).toBe('card');
    expect(notificationTarget('somethingNew', null).screen).toBe('notifications');
  });

  it('every action label exists in both languages', () => {
    const kinds = ['reservationRequested', 'reservationDecided', 'roamingRequested', 'roamingDecided', 'claimDecided', 'reencodeApproved', 'contentSubmitted', 'contentDecided', 'posterProofDecided', 'cardShipped', 'checkIn', 'hubMention', 'eventBroadcast', 'x'];
    for (const locale of ['en', 'id'] as const) {
      const t = createTranslator(locale);
      for (const k of kinds) {
        const key = notificationTarget(k, { eventId: 'e' }).actionKey;
        expect(t(key as never)).not.toBe(key);
      }
    }
  });
});

describe('validation', () => {
  it('roaming keeps its originating event field (F11)', () => {
    expect(roamingSchema.parse({ eventId: 'e1', type: 'ATTENDANCE', originEventId: 'e1' }).originEventId).toBe('e1');
    expect(roamingSchema.parse({ eventId: 'e1', type: 'SOCIAL_HUB' }).originEventId).toBeUndefined();
  });

  it('a rejected poster needs a reason', () => {
    expect(contentDecisionSchema.safeParse({ decision: 'REJECTED', note: '' }).success).toBe(false);
    expect(contentDecisionSchema.safeParse({ decision: 'REJECTED', note: 'Wrong date' }).success).toBe(true);
    expect(contentDecisionSchema.safeParse({ decision: 'APPROVED' }).success).toBe(true);
  });

  it('EN and ID define the same ux keys (D2 tab names included)', () => {
    const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [`${p}${k}`] : keys(v, `${p}${k}.`)));
    expect(keys(dictionaries.id.ux).sort()).toEqual(keys(dictionaries.en.ux).sort());
    expect(dictionaries.id.ux.nav).toEqual({ home: 'Beranda', events: 'Event', card: 'Kartu', community: 'Komunitas', account: 'Akun' });
    expect(dictionaries.en.ux.events.reservation).toBe('Reservation');
    expect(dictionaries.id.ux.events.reservation).toBe('Reservasi');
  });
});
