/** Shapes exchanged between the server, the dashboard and the app. */
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
  | 'INSUFFICIENT_XP'
  | 'REWARD_UNAVAILABLE'
  | 'SPIN_LIMIT'
  | 'REDEEM_USED'
  | 'REDEEM_EXPIRED'
  | 'REPORT_REVIEWED'
  | 'RECAP_LOCKED'
  | 'CHECK_IN_REQUIRED'
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
  method: Exclude<CheckInMethod, 'NFC'>;
  /** APP_QR only: proof the QR was valid when scanned, used to confirm. Null when there is an issue. */
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
