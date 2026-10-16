import type { ApiErrorCode } from '@pats/shared';

/** Expected failure with a stable code; route handlers turn it into a JSON error response. */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message?: string,
    readonly extra: { fields?: Record<string, string>; retryAfter?: number; params?: Record<string, string | number> } = {},
  ) {
    super(message ?? code);
  }
}

/** i18n key for each error code (UI side). */
export const ERROR_MESSAGE_KEY: Record<ApiErrorCode, string> = {
  VALIDATION: 'validation.invalid',
  UNAUTHENTICATED: 'errors.unauthenticated',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.notFound',
  ACCOUNT_NOT_FOUND: 'errors.accountNotFound',
  ACCOUNT_DISABLED: 'errors.accountDisabled',
  EMAIL_TAKEN: 'errors.emailTaken',
  UNDERAGE: 'errors.underage',
  OTP_INVALID: 'errors.otpInvalid',
  OTP_EXPIRED: 'errors.otpExpired',
  OTP_TOO_MANY_ATTEMPTS: 'errors.otpTooManyAttempts',
  RATE_LIMITED: 'errors.rateLimited',
  OTP_SEND_FAILED: 'errors.otpSendFailed',
  CITY_NOT_FOUND: 'errors.cityNotFound',
  EVENT_NOT_OPEN: 'errors.eventNotOpen',
  EVENT_ENDED: 'errors.eventEnded',
  QR_INVALID: 'errors.qrInvalid',
  QR_EXPIRED: 'errors.qrExpired',
  QR_USED: 'errors.qrUsed',
  TICKET_EXPIRED: 'errors.ticketExpired',
  MEMBER_INACTIVE: 'errors.memberInactive',
  MEMBER_OTHER_CITY: 'errors.memberOtherCity',
  ALREADY_CHECKED_IN: 'errors.alreadyCheckedIn',
  INSUFFICIENT_XP: 'loyalty.insufficientXp',
  REWARD_UNAVAILABLE: 'loyalty.unavailable',
  SPIN_LIMIT: 'loyalty.spinLimit',
  REDEEM_USED: 'loyalty.codeUsed',
  REDEEM_EXPIRED: 'loyalty.codeExpired',
  REPORT_REVIEWED: 'loyalty.reportReviewed',
  RECAP_LOCKED: 'loyalty.recapLocked',
  CHECK_IN_REQUIRED: 'loyalty.checkInRequired',
  INTERNAL: 'errors.generic',
};
