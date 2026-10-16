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
  INTERNAL: 'errors.generic',
};
