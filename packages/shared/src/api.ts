/** Shapes exchanged between the server, the dashboard and the app. */
import type { CardStatus, MemberStatus, Role } from './enums';
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
