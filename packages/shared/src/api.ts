/** Shapes exchanged between the server, the dashboard and the app. */
import type { CardBatchStatus, Capability } from './card';
import type { CardStatus, CheckInMethod, EventStatus, MemberStatus, Role } from './enums';
import type { EventPhase } from './event';
import type { Locale } from './i18n/types';

/** Error body of every non-2xx API response. `code` is stable; `message` is for logs. */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field -> i18n key, for form validation errors. */
    fields?: Record<string, string>;
    /** Seconds until the caller may retry (rate limits, resend cooldown). */
    retryAfter?: number;
  };
}

export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_DISABLED'
  | 'EMAIL_TAKEN'
  | 'UNDERAGE'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'RATE_LIMITED'
  | 'OTP_SEND_FAILED'
  | 'CITY_NOT_FOUND'
  | 'EVENT_NOT_OPEN'
  | 'EVENT_ENDED'
  | 'QR_INVALID'
  | 'QR_EXPIRED'
  | 'QR_USED'
  | 'TICKET_EXPIRED'
  | 'MEMBER_INACTIVE'
  | 'MEMBER_OTHER_CITY'
  | 'ALREADY_CHECKED_IN'
  | 'CARD_NOT_FOUND'
  | 'CARD_INVALID'
  | 'CARD_REVOKED'
  | 'CARD_NOT_DELIVERED'
  | 'CARD_NOT_ENCODED'
  | 'CARD_ALREADY_DELIVERED'
  | 'CARD_UID_MISMATCH'
  | 'CARD_STATUS'
  | 'CARD_CLAIMED'
  | 'CARD_OTHER_BATCH'
  | 'LEASE_LOST'
  | 'UID_IN_USE'
  | 'NOT_IN_QUEUE'
  | 'BATCH_EMPTY'
  | 'BATCH_TOO_LARGE'
  | 'BATCH_MIXED_CITIES'
  | 'BATCH_DUPLICATE_MEMBER'
  | 'BATCH_STATUS'
  | 'BATCH_NOT_ENCODED'
  | 'FILES_FAILED'
  | 'GRANT_INVALID'
  | 'REQUEST_PENDING'
  | 'REQUEST_DECIDED'
  | 'PUSH_NOT_CONFIGURED'
  | 'INSUFFICIENT_XP'
  | 'REWARD_UNAVAILABLE'
  | 'SPIN_LIMIT'
  | 'REDEEM_USED'
  | 'REDEEM_EXPIRED'
  | 'REPORT_REVIEWED'
  | 'RECAP_LOCKED'
  | 'CHECK_IN_REQUIRED'
  | 'RESERVATION_LIMIT'
  | 'ROAMING_LIMIT'
  | 'HUB_MUTED'
  | 'SLOT_TAKEN'
  | 'MEDIA_INVALID'
  | 'INTERNAL';

export interface OtpRequestResponse {
  /** ISO time the code stops working. */
  expiresAt: string;
  /** Seconds before "Resend" may be used. */
  resendAfter: number;
  /** Present only when OTP_PROVIDER=demo: the code to show on screen. */
  demoCode?: string;
}

export interface CitySummary {
  id: string;
  code: string;
  name: string;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    phone: string;
    name: string;
    role: Role;
    locale: Locale;
    city: CitySummary | null;
    /** What this account may do with cards and check-in (PRODUCT.md §3). */
    capabilities: Capability[];
  };
  member: {
    id: string;
    nim: string;
    fullName: string;
    city: CitySummary;
    favoriteSong: string;
    favoriteGenre: string;
    quotes: string;
    photoUrl: string | null;
    isPromoter: boolean;
    status: MemberStatus;
    joinedAt: string;
    cardStatus: CardStatus;
  } | null;
}

export interface AuthTokens {
  accessToken: string;
  /** ISO time the access token expires. */
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  me: MeResponse;
}

export interface RegistrationResponse {
  nim: string;
  fullName: string;
  city: CitySummary & { waGroupUrl: string | null };
  appLinks: { ios: string | null; android: string | null };
  /** Whether a welcome email with the same details was sent. */
  emailSent: boolean;
}

// ─── Phase 1: digital card, events, check-in ─────────────────────────────────

/** Rotating app QR (PRODUCT.md §10.1): signed, short-lived, single use. */
export interface CardTokenResponse {
  /** What the QR encodes. */
  token: string;
  expiresAt: string;
  ttlSeconds: number;
  /** Server clock when issued, so the app can correct for a skewed phone clock. */
  serverTime: string;
}

export interface EventCity extends CitySummary {
  timezone: string;
}

export interface EventSummary {
  id: string;
  title: string;
  description: string;
  city: EventCity;
  venue: { id: string; name: string; address: string | null } | null;
  startsAt: string;
  endsAt: string;
  checkInOpensAt: string;
  checkInClosesAt: string;
  status: EventStatus;
  /** What the status means right now (see eventPhase). */
  phase: EventPhase;
  capacity: number | null;
  /** Path of the event flyer image on the API origin, if HQ uploaded one. */
  flyerUrl: string | null;
  /** Member view: my check-in at this event, if any. */
  myCheckIn?: { checkedInAt: string; method: CheckInMethod } | null;
  /** Admin view: check-ins so far. */
  checkInCount?: number;
}

export interface EventListResponse {
  upcoming: EventSummary[];
  past: EventSummary[];
}

export interface EventDetailResponse {
  event: EventSummary;
}

export interface MyCheckIn {
  id: string;
  checkedInAt: string;
  method: CheckInMethod;
  event: { id: string; title: string; venueName: string | null; startsAt: string; city: EventCity };
}

export interface CheckInHistoryResponse {
  checkIns: MyCheckIn[];
}

/** The member as the crew sees them on the scan result screen. */
export interface ScanMember {
  id: string;
  nim: string;
  fullName: string;
  photoUrl: string | null;
  city: CitySummary;
  status: MemberStatus;
}

/** Why a scanned member can't be checked in. The member is identified, so the crew sees who. */
export type CheckInIssueCode = 'ALREADY_CHECKED_IN' | 'MEMBER_INACTIVE' | 'MEMBER_OTHER_CITY';

export interface CheckInPreviewResponse {
  member: ScanMember;
  method: CheckInMethod;
  /** APP_QR / NFC: proof the QR or card was valid when scanned, used to confirm. Null when there is an issue. */
  ticket: string | null;
  /** Ticket lifetime: the crew has until then to confirm. */
  ticketExpiresAt: string | null;
  issue: { code: CheckInIssueCode; checkedInAt?: string; byAdmin?: string } | null;
  /** Member from another city with an approved attendance roaming request. */
  roaming: boolean;
  /** The optional head-count cap is already reached (a warning; the crew decides). */
  capacityReached: boolean;
}

export interface AttendanceEntry {
  id: string;
  checkedInAt: string;
  method: CheckInMethod;
  manualReason: string | null;
  member: { id: string; nim: string; fullName: string; photoUrl: string | null; cityName: string };
  admin: { id: string; name: string };
}

export interface CheckInResponse {
  checkIn: AttendanceEntry;
  count: number;
}

export interface AttendanceResponse {
  entries: AttendanceEntry[];
  count: number;
  byMethod: Record<CheckInMethod, number>;
  phase: EventPhase;
  serverTime: string;
}

export interface ManualSearchResponse {
  members: (ScanMember & { checkedInAt: string | null })[];
}

export interface EventFormMetaResponse {
  city: EventCity;
  venues: { id: string; name: string }[];
  /** Default for "check-in opens N minutes before" (setting checkInOpensBeforeMinutes). */
  opensBeforeMinutes: number;
}

// ─── Phase 2: physical cards, encode stations, push ───────────────────────────

/** A member as card screens show them. */
export interface CardMember {
  id: string;
  nim: string;
  fullName: string;
  photoUrl: string | null;
  city: CitySummary;
  status: MemberStatus;
}

export interface CardInfo {
  id: string;
  status: CardStatus;
  /** Compact upper-case hex, null until encoded. */
  nfcUid: string | null;
  /** NTAG213 / 215 / 216, once encoded. */
  chipType: string | null;
  batch: { id: string; label: string } | null;
  encodedAt: string | null;
  /** Station that encoded it, e.g. "Mac Card Station" or "iPhone (Rara)". */
  encodedStation: string | null;
  deliveredAt: string | null;
  deliveredBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  /** This card replaces a revoked one. */
  isReplacement: boolean;
}

// Encode stations (Mac Card Station, HQ phones, an admin phone with an approved re-encode).

export type EncodeMode = 'encode' | 'reencode';

export interface StationBatch {
  id: string;
  label: string;
  city: CitySummary;
  status: CardBatchStatus;
  cardCount: number;
  encodedCount: number;
  /** Cards a station is holding right now. */
  claimedCount: number;
}

export interface StationBatchesResponse {
  batches: StationBatch[];
}

export interface StationClaimResponse {
  /** Null when the card is already encoded and the station didn't ask to re-encode. */
  lease: { id: string; expiresAt: string; station: string; mode: EncodeMode } | null;
  card: CardInfo;
  member: CardMember;
  /** What gets written to the chip; the same URL as the printed QR. */
  url: string;
  /** The card is already ENCODED: a station only writes again in re-encode mode. */
  alreadyEncoded: boolean;
}

export interface StationKeyResponse {
  /** 4-byte PWD and 2-byte PACK, hex. Derived by the server for this UID; never stored. */
  pwd: string;
  pack: string;
  url: string;
}

export interface StationEncodedResponse {
  card: CardInfo;
  batch: { id: string; label: string; cardCount: number; encodedCount: number } | null;
}

// Crew card work in the app.

export type HandoverIssueCode = 'ALREADY_DELIVERED' | 'MEMBER_INACTIVE' | 'OTHER_CITY';

export interface HandoverPreviewResponse {
  card: CardInfo;
  member: CardMember;
  issue: { code: HandoverIssueCode; at?: string; by?: string } | null;
}

export interface HandoverResponse {
  card: CardInfo;
  member: CardMember;
}

export type ReencodeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'USED' | 'EXPIRED';

export interface ReencodeRequestInfo {
  id: string;
  status: ReencodeStatus;
  reason: string;
  requestedBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** APPROVED: the requester may encode until then, once. */
  grantExpiresAt: string | null;
  usedAt: string | null;
  /** The signed-in admin asked for it (only they may use the grant). */
  mine: boolean;
}

export interface CrewCardMember extends CardMember {
  card: CardInfo | null;
}

export interface CrewCardSearchResponse {
  members: CrewCardMember[];
}

export interface CrewMemberCardsResponse {
  member: CardMember;
  /** Newest first; the live card (if any) is first. */
  cards: CardInfo[];
  /** Latest re-encode request on the live card. */
  reencode: ReencodeRequestInfo | null;
}

/** Public view of a card URL (web /c/<token> and the app's deep link). */
export interface CardProfileResponse {
  state: 'active' | 'pending' | 'revoked' | 'inactive';
  member: {
    fullName: string;
    nim: string;
    city: string;
    joinedAt: string;
    favoriteSong: string;
    favoriteGenre: string;
    quotes: string;
  } | null;
  /** The signed-in member is the card's owner. */
  isMine: boolean;
}

// Push & notification centre.

export const NOTIFICATION_CATEGORIES = ['events', 'activity'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationPrefs = Record<NotificationCategory, boolean>;

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  /** Where tapping it leads, e.g. { eventId }. */
  data: Record<string, string> | null;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unread: number;
}

export interface NotificationPrefsResponse {
  prefs: NotificationPrefs;
}

/** Loyalty (Phase 3) codes carry their copy in the loyalty.* namespace. */
const LOYALTY_ERROR_KEYS: Partial<Record<ApiErrorCode, string>> = {
  INSUFFICIENT_XP: 'loyalty.insufficientXp',
  REWARD_UNAVAILABLE: 'loyalty.unavailable',
  SPIN_LIMIT: 'loyalty.spinLimit',
  REDEEM_USED: 'loyalty.codeUsed',
  REDEEM_EXPIRED: 'loyalty.codeExpired',
  REPORT_REVIEWED: 'loyalty.reportReviewed',
  RECAP_LOCKED: 'loyalty.recapLocked',
  CHECK_IN_REQUIRED: 'loyalty.checkInRequired',
};

/** i18n key of an API error code: VALIDATION → validation.invalid, loyalty codes → loyalty.*, else errors.<camelCase>. */
export function errorMessageKey(code: ApiErrorCode | 'NETWORK'): string {
  if (code === 'VALIDATION') return 'validation.invalid';
  if (code === 'INTERNAL') return 'errors.generic';
  const loyalty = code === 'NETWORK' ? undefined : LOYALTY_ERROR_KEYS[code];
  if (loyalty) return loyalty;
  const [first, ...rest] = code.toLowerCase().split('_');
  return `errors.${first}${rest.map((p) => p[0]!.toUpperCase() + p.slice(1)).join('')}`;
}
