/**
 * UX redesign (21 Oct 2026): the shapes and pure rules behind the shared navigation, the Home task
 * flow, the event journey, the card readiness split, the staff event workspace and notification
 * routing. The server computes these; the apps only render them (docs/contracts/ux-redesign-21oct.md).
 * Everything here is additive: older app builds keep reading the fields they already know.
 */
import { z } from 'zod';
import type { CardStatus, CheckInMethod } from './enums';
import type { EventPhase, EventTiming } from './event';
import { zonedParts } from './format';

// ─── Event timing labels (UX08, F19) ──────────────────────────────────────────

export type EventBoundary = 'checkInOpens' | 'starts' | 'checkInCloses' | 'ends';

export interface EventTimingInfo {
  /** IANA zone of the event's city; every time is shown in it. */
  timezone: string;
  startsAt: string;
  endsAt: string;
  checkInOpensAt: string;
  checkInClosesAt: string;
  /** The event ends on a later calendar day than it starts (in the city's zone). */
  overnight: boolean;
  /** Check-in opens this many minutes before the start. */
  opensBeforeMinutes: number;
  /** The next boundary still ahead, for "Check-in opens at 21.00" style labels; null once ended. */
  next: { kind: EventBoundary; at: string } | null;
}

export function eventTimingInfo(e: Omit<EventTiming, 'status'>, timezone: string, now: Date = new Date()): EventTimingInfo {
  const start = zonedParts(e.startsAt, timezone);
  const end = zonedParts(e.endsAt, timezone);
  const boundaries: { kind: EventBoundary; at: Date }[] = [
    { kind: 'checkInOpens', at: e.checkInOpensAt },
    { kind: 'starts', at: e.startsAt },
    { kind: 'checkInCloses', at: e.checkInClosesAt },
    { kind: 'ends', at: e.endsAt },
  ];
  const next = boundaries
    .filter((b) => b.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  return {
    timezone,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    checkInOpensAt: e.checkInOpensAt.toISOString(),
    checkInClosesAt: e.checkInClosesAt.toISOString(),
    overnight: start.year !== end.year || start.month !== end.month || start.day !== end.day,
    opensBeforeMinutes: Math.max(0, Math.round((e.startsAt.getTime() - e.checkInOpensAt.getTime()) / 60_000)),
    next: next ? { kind: next.kind, at: next.at.toISOString() } : null,
  };
}

// ─── Member event actions (F09, UX06, UX07, UX09) ─────────────────────────────

export type MemberActionKey = 'reserve' | 'showQr' | 'roaming' | 'claimXp' | 'draw';

/** Why an action is not offered; each has an `ux.reason.<code>` string. */
export type MemberActionReason =
  | 'eventEnded'
  | 'eventNotEnded'
  | 'noVenue'
  | 'reservationExists'
  | 'noCityAccess'
  | 'checkInNotOpen'
  | 'alreadyCheckedIn'
  | 'roamingRequired'
  | 'homeCity'
  | 'claimSubmitted'
  | 'drawNotConfigured';

export interface MemberAction {
  key: MemberActionKey;
  available: boolean;
  reason: MemberActionReason | null;
}

export interface MemberEventContext {
  /** The event is in the member's home city. */
  homeCity: boolean;
  /** Home city, or an approved Community (hub) access grant for the event's city. */
  cityAccess: boolean;
  /** Attendance roaming request for this event, if any. */
  attendanceRoaming: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | null;
  checkedIn: boolean;
  hasVenue: boolean;
  /** The member's live (pending/confirmed) reservation for this event. */
  reservation: { id: string; status: 'PENDING' | 'CONFIRMED' } | null;
  /** The member's Claim XP (member form) for this event. */
  claim: { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' } | null;
  drawConfigured: boolean;
}

/** Which onward actions an event offers this member right now, and why the others are not offered. */
export function memberEventActions(
  e: { phase: EventPhase; endsAt: Date },
  ctx: MemberEventContext,
  now: Date = new Date(),
): MemberAction[] {
  const ended = e.phase === 'ended' || e.endsAt.getTime() <= now.getTime();
  const act = (key: MemberActionKey, reason: MemberActionReason | null): MemberAction => ({ key, available: reason === null, reason });
  const reserve = ended
    ? 'eventEnded'
    : !ctx.hasVenue
      ? 'noVenue'
      : ctx.reservation
        ? 'reservationExists'
        : !ctx.cityAccess
          ? 'noCityAccess'
          : null;
  const mayAttend = ctx.homeCity || ctx.attendanceRoaming === 'APPROVED';
  const showQr = ctx.checkedIn
    ? 'alreadyCheckedIn'
    : ended
      ? 'eventEnded'
      : !mayAttend
        ? 'roamingRequired'
        : e.phase !== 'open'
          ? 'checkInNotOpen'
          : null;
  const roaming = ctx.homeCity ? 'homeCity' : ended ? 'eventEnded' : null;
  const claimXp = !ended
    ? 'eventNotEnded'
    : ctx.claim
      ? 'claimSubmitted'
      : !ctx.homeCity && !ctx.checkedIn
        ? 'noCityAccess'
        : null;
  const draw = !ctx.drawConfigured ? 'drawNotConfigured' : null;
  return [act('reserve', reserve), act('showQr', showQr), act('roaming', roaming), act('claimXp', claimXp), act('draw', draw)];
}

// ─── Home task flow (D4) ──────────────────────────────────────────────────────

/**
 * next event → blast poster (optional) → reservation (table/sofa, bonus XP) → check-in → completed.
 * Steps the member completes by tapping are stored per member and event; check-in and completion
 * come only from the server (crew confirms attendance). Blast poster (22 Oct 2026): the member shares
 * the poster and uploads a screenshot as proof; crew approval awards posterShareXp (default 2). It is
 * optional: skipping it (a tap) or leaving it open never blocks the later steps.
 */
export const JOURNEY_STEPS = ['event', 'poster', 'reservation', 'checkIn', 'completed'] as const;
export type JourneyStepKey = (typeof JOURNEY_STEPS)[number];
/** Steps a member may mark done themselves (POST /api/me/journey). For `poster` the tap means "skip". */
export const TAPPABLE_STEPS = ['event', 'poster', 'reservation'] as const satisfies readonly JourneyStepKey[];
export type TappableStep = (typeof TAPPABLE_STEPS)[number];

export const journeyTapSchema = z.object({
  eventId: z.string().trim().min(1).max(150),
  step: z.enum(TAPPABLE_STEPS),
});

export interface PosterProofInfo {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Owner/crew-only image path (bearer). */
  imageUrl: string;
  submittedAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  xpAwarded: number | null;
}

export interface JourneyStep {
  key: JourneyStepKey;
  /** `optional`: an optional step that is still open (poster); it is never `current`. */
  state: 'done' | 'current' | 'upcoming' | 'optional';
  /** How the step completes: member tap, crew review of an upload (poster), or the server. */
  completion: 'tap' | 'review' | 'server';
  completedAt: string | null;
  /** The step can be skipped and never blocks later steps (poster). */
  optional?: boolean;
  /**
   * reservation: reserved (confirmed), requested (waiting for crew), skipped (tapped without booking).
   * poster: submitted (proof waiting for crew), approved, rejected (send a new proof), skipped.
   */
  outcome?: 'reserved' | 'requested' | 'skipped' | 'submitted' | 'approved' | 'rejected';
  /** reservation: XP added at check-in when the reservation is confirmed (setting reservationBonusXp). */
  bonusXp?: number;
  /** poster: XP awarded when crew approves the proof (setting posterShareXp). */
  rewardXp?: number;
  /** poster: the member's proof for this event, if any. */
  proof?: PosterProofInfo | null;
}

export interface JourneyInput {
  taps: Partial<Record<TappableStep, Date>>;
  posterProof?: PosterProofInfo | null;
  posterShareXp?: number;
  reservation: { status: 'PENDING' | 'CONFIRMED'; updatedAt: Date } | null;
  checkIn: { checkedInAt: Date } | null;
  ended: boolean;
  endsAt: Date;
  reservationBonusXp: number;
}

export function buildJourney(input: JourneyInput): JourneyStep[] {
  const iso = (d: Date | undefined | null) => (d ? d.toISOString() : null);
  const steps: Omit<JourneyStep, 'state'>[] = [
    { key: 'event', completion: 'tap', completedAt: iso(input.taps.event) },
    (() => {
      const proof = input.posterProof ?? null;
      const base = { key: 'poster' as const, completion: 'review' as const, optional: true, rewardXp: input.posterShareXp ?? 0, proof };
      if (proof?.status === 'APPROVED') return { ...base, completedAt: proof.reviewedAt, outcome: 'approved' as const };
      if (proof?.status === 'PENDING') return { ...base, completedAt: null, outcome: 'submitted' as const };
      if (proof?.status === 'REJECTED') return { ...base, completedAt: null, outcome: 'rejected' as const };
      if (input.taps.poster) return { ...base, completedAt: iso(input.taps.poster), outcome: 'skipped' as const };
      return { ...base, completedAt: null };
    })(),
    (() => {
      const r = input.reservation;
      if (r?.status === 'CONFIRMED') return { key: 'reservation' as const, completion: 'tap' as const, completedAt: iso(r.updatedAt), outcome: 'reserved' as const, bonusXp: input.reservationBonusXp };
      if (r?.status === 'PENDING') return { key: 'reservation' as const, completion: 'tap' as const, completedAt: null, outcome: 'requested' as const, bonusXp: input.reservationBonusXp };
      return { key: 'reservation' as const, completion: 'tap' as const, completedAt: iso(input.taps.reservation), ...(input.taps.reservation ? { outcome: 'skipped' as const } : {}), bonusXp: input.reservationBonusXp };
    })(),
    { key: 'checkIn', completion: 'server', completedAt: iso(input.checkIn?.checkedInAt) },
    { key: 'completed', completion: 'server', completedAt: input.checkIn && input.ended ? input.endsAt.toISOString() : null },
  ];
  let current = false;
  return steps.map((s) => {
    if (s.completedAt) return { ...s, state: 'done' as const };
    if (s.optional) return { ...s, state: 'optional' as const };
    if (!current) {
      current = true;
      return { ...s, state: 'current' as const };
    }
    return { ...s, state: 'upcoming' as const };
  });
}

// ─── Card: digital readiness vs physical card (D3, UX10, F07) ─────────────────

export type PhysicalCardStage = 'queued' | 'printing' | 'atHq' | 'encoded' | 'shipped' | 'delivered' | 'inactive';

/** Member-facing stage; ENCODED is only "shipped" once HQ actually shipped the batch to the city. */
export function physicalCardStage(status: CardStatus, shippedToCity: boolean): PhysicalCardStage {
  switch (status) {
    case 'NOT_PRINTED':
      return 'queued';
    case 'IN_BATCH':
    case 'SENT_TO_VENDOR':
      return 'printing';
    case 'RECEIVED_HQ':
      return 'atHq';
    case 'ENCODED':
      return shippedToCity ? 'shipped' : 'encoded';
    case 'DELIVERED':
      return 'delivered';
    case 'REVOKED':
      return 'inactive';
  }
}

export interface CardStateResponse {
  /** The live QR in the app: usable now, independent of the physical card. */
  digital: { ready: boolean; reason: 'memberInactive' | 'noMembership' | null };
  physical: {
    status: CardStatus;
    stage: PhysicalCardStage;
    batchLabel: string | null;
    shippedToCityAt: string | null;
    deliveredAt: string | null;
    /** Replacement card fee, when this card replaces a lost/damaged one. Paid off-app; crew records it. */
    replacementFee: { amount: number; paidAt: string | null } | null;
  } | null;
  /** What the printed KTM shows (21 Oct design): NAME, FAVORITE DRINK, QOTD (the member's quote). */
  face: { name: string; favoriteDrink: string; quote: string } | null;
}

// ─── Reservations: poster highlight + deposit (D5, UX18, UX19, F26) ───────────

export interface ReservationPayment {
  /** A deposit (DP) is recorded; until then this reservation blocks new bookings. */
  paid: boolean;
  amount: number | null;
  paidAt: string | null;
  recordedBy: string | null;
  /** Unpaid and still pending/confirmed: the member can't book another slot. */
  blocksNewBookings: boolean;
}

export interface EventPoster {
  /** Path of the approved poster on the API origin, or null. */
  url: string | null;
  /** The approved description (what members see). */
  description: string;
}

export type SlotKind = 'TABLE' | 'SOFA' | 'OTHER';

export interface ReservationsSold {
  table: number;
  sofa: number;
  /** Confirmed reservations whose slot is no longer in the floor plan. */
  other: number;
  total: number;
  pax: number;
}

export function emptySold(): ReservationsSold {
  return { table: 0, sofa: 0, other: 0, total: 0, pax: 0 };
}

/** Confirmed reservations, split by the slot kind in the event venue's floor plan. */
export function countSold(
  reservations: { slotCode: string; pax: number }[],
  slots: { code: string; kind: 'TABLE' | 'SOFA' }[],
): ReservationsSold {
  const kinds = new Map(slots.map((s) => [s.code, s.kind]));
  const out = emptySold();
  for (const r of reservations) {
    const kind = kinds.get(r.slotCode);
    if (kind === 'TABLE') out.table++;
    else if (kind === 'SOFA') out.sofa++;
    else out.other++;
    out.total++;
    out.pax += r.pax;
  }
  return out;
}

/**
 * "FDC sold" (FDC = First Drink Charge / Free Drink Coupon, owner 21 Oct): the number the admin
 * reports on the event report. Null until the report exists; never derived by the server.
 */
export interface FdcSold {
  value: number | null;
  status: 'reported' | 'notReported';
}

export function fdcFromReport(report: { fdcSold: number } | null | undefined): FdcSold {
  return report ? { value: report.fdcSold, status: 'reported' } : { value: null, status: 'notReported' };
}

// ─── Event report (22 Oct 2026) ───────────────────────────────────────────────

/** The seven numbers per event, in display/CSV order. */
export const EVENT_REPORT_FIELDS = ['tablesSold', 'sofasSold', 'fdcSold', 'paxTotal', 'membersAttended', 'nonMembersAttended', 'newMembers'] as const;
export type EventReportField = (typeof EVENT_REPORT_FIELDS)[number];
export type EventReportNumbers = Record<EventReportField, number>;

const reportCount = z.number({ error: 'validation.numberInvalid' }).int('validation.numberInvalid').min(0, 'validation.numberInvalid').max(1_000_000, 'validation.numberInvalid');
export const eventReportInput = z.object(Object.fromEntries(EVENT_REPORT_FIELDS.map((f) => [f, reportCount])) as Record<EventReportField, typeof reportCount>);

export interface EventReportInfo extends EventReportNumbers {
  id: string;
  eventId: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** What the server already knows, shown next to the inputs; never written into the report. */
export interface EventReportReference {
  /** Confirmed reservations by slot kind. */
  tablesSold: number;
  sofasSold: number;
  /** Members checked in (any method). */
  membersAttended: number;
  /** Members of the event's city who registered between check-in opening and the event end. */
  newMembers: number;
  /** Guests on confirmed reservations (pax), a lower bound for the total. */
  reservationPax: number;
}

export function sumReports(rows: EventReportNumbers[]): EventReportNumbers {
  const out = Object.fromEntries(EVENT_REPORT_FIELDS.map((f) => [f, 0])) as EventReportNumbers;
  for (const r of rows) for (const f of EVENT_REPORT_FIELDS) out[f] += r[f];
  return out;
}

// ─── Poster proof review (22 Oct 2026) ────────────────────────────────────────

export const posterProofDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().max(500).default(''),
  })
  .refine((v) => v.decision !== 'REJECTED' || v.reason.length >= 3, { path: ['reason'], message: 'validation.required' });

// ─── Event poster / description content (D5) ──────────────────────────────────

export type ContentSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export interface ContentSubmissionInfo {
  id: string;
  eventId: string;
  eventTitle: string;
  city: { id: string; name: string };
  status: ContentSubmissionStatus;
  /** Proposed description, or null when only the poster changes. */
  description: string | null;
  /** Proposed poster (staff-only preview path), or null when only the description changes. */
  posterUrl: string | null;
  submittedBy: string;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface EventContentResponse {
  live: EventPoster;
  /** HQ edits apply at once; a regional admin's edits wait for HQ approval. */
  mode: 'direct' | 'approval';
  pending: ContentSubmissionInfo | null;
  history: ContentSubmissionInfo[];
}

export const EVENT_DESCRIPTION_MAX = 2000;

export const contentDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(500).default(''),
  })
  .refine((v) => v.decision !== 'REJECTED' || v.note.length >= 3, { path: ['note'], message: 'validation.required' });

// ─── Staff: Admin mode scope, Home, event workspace (D1, D6, UX23–UX30, F14–F27) ─

export interface AdminScope {
  kind: 'HQ' | 'CITY';
  /** The regional admin's city; null for HQ (all cities). */
  city: { id: string; code: string; name: string } | null;
}

export interface WorkCount {
  count: number;
  /** Canonical destination (same vocabulary as notification targets). */
  target: NotificationTarget;
}

// ─── Notification routing (UX22, F32) ─────────────────────────────────────────

export type NotificationScreen =
  | 'event'
  | 'attendance'
  | 'card'
  | 'reservation'
  | 'conversation'
  | 'hub'
  | 'roaming'
  | 'claims'
  | 'adminReservations'
  | 'adminRoaming'
  | 'adminClaims'
  | 'adminMemberCard'
  | 'adminEventContent'
  | 'adminContentQueue'
  | 'adminEvent'
  | 'adminPosterProofs'
  | 'notifications';

export interface NotificationTarget {
  screen: NotificationScreen;
  eventId?: string;
  reservationId?: string;
  conversationId?: string;
  channelId?: string;
  claimId?: string;
  memberId?: string;
  requestId?: string;
  submissionId?: string;
  proofId?: string;
  /** Staff work: open it in Admin mode (an authorized account gets "Open in Admin mode"). */
  requiresAdminMode: boolean;
  /** i18n key of the row's action label (ux.notifAction.*). */
  actionKey: string;
}

const pick = (data: Record<string, string>, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => data[k]).map((k) => [k, data[k]!]));

const ID_KEYS = ['eventId', 'reservationId', 'conversationId', 'channelId', 'claimId', 'memberId', 'requestId', 'submissionId', 'proofId'] as const;

/** Where a notification leads, from its kind and stored payload (old rows included). */
export function notificationTarget(kind: string, data: Record<string, string> | null | undefined): NotificationTarget {
  const d = data ?? {};
  const ids = pick(d, ID_KEYS);
  const to = (screen: NotificationScreen, actionKey: string, requiresAdminMode = false): NotificationTarget => ({
    screen,
    ...ids,
    requiresAdminMode,
    actionKey: `ux.notifAction.${actionKey}`,
  });
  switch (kind) {
    case 'reservationRequested':
      return to('adminReservations', 'reviewBooking', true);
    case 'reservationDecided':
      return to('reservation', 'openBooking');
    case 'roamingRequested':
      return to('adminRoaming', 'reviewRequest', true);
    case 'roamingDecided':
      return to('roaming', 'viewRequest');
    case 'claimDecided':
      return to('claims', 'viewClaim');
    case 'reencodeApproved':
    case 'reencodeRejected':
      return to('adminMemberCard', 'openCard', true);
    case 'contentSubmitted':
      return to('adminContentQueue', 'reviewPoster', true);
    case 'contentDecided':
      return to('adminEventContent', 'viewPoster', true);
    case 'posterProofDecided':
      return to('event', 'viewProof');
    case 'cardShipped':
    case 'cardDelivered':
      return to('card', 'openCard');
    case 'checkIn':
      return to('attendance', 'viewAttendance');
    case 'hubMention':
      return d.conversationId ? to('conversation', 'openChat', true) : to('hub', 'openChat', true);
    case 'eventBroadcast':
    case 'reminder3d':
    case 'reminder1d':
    case 'reminderToday':
    case 'thankYou':
    case 'fomo':
      return d.eventId ? to('event', 'viewEvent') : to('notifications', 'open');
  }
  switch (d.screen) {
    case 'event':
      return d.eventId ? to('event', 'viewEvent') : to('notifications', 'open');
    case 'card':
      return to('card', 'openCard');
    case 'claims':
      return to('claims', 'viewClaim');
    case 'reservations':
      return to('reservation', 'openBooking');
    case 'roaming':
      return to('roaming', 'viewRequest');
    case 'history':
      return to('attendance', 'viewAttendance');
    default:
      return to('notifications', 'open');
  }
}

// ─── Staff without membership (F03) ───────────────────────────────────────────

/**
 * `member`: a member profile exists (staff included). `staffOnly`: a staff account without a
 * personal membership: no NIM, card, XP or personal participation is invented for it.
 */
export type MembershipState = 'member' | 'staffOnly';

export interface MyCheckInBrief {
  checkedInAt: string;
  method: CheckInMethod;
}
