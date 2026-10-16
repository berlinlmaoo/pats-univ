import type { ApiErrorCode, AuthTokens } from '@pats/shared';
import { API_URL } from './config';

/** Stable error codes + params; screens translate them. */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode | 'NETWORK',
    readonly params: Record<string, string | number> = {},
    readonly fields: Record<string, string> = {},
  ) {
    super(code);
  }
}

/** i18n key for an API error code. Mirrors the web's ERROR_MESSAGE_KEY. */
export function errorKey(code: ApiFailure['code']): string {
  switch (code) {
    case 'NETWORK':
      return 'errors.network';
    case 'ACCOUNT_NOT_FOUND':
      return 'errors.accountNotFound';
    case 'ACCOUNT_DISABLED':
      return 'errors.accountDisabled';
    case 'OTP_INVALID':
      return 'errors.otpInvalid';
    case 'OTP_EXPIRED':
      return 'errors.otpExpired';
    case 'OTP_TOO_MANY_ATTEMPTS':
      return 'errors.otpTooManyAttempts';
    case 'RATE_LIMITED':
      return 'errors.rateLimited';
    case 'OTP_SEND_FAILED':
      return 'errors.otpSendFailed';
    case 'UNAUTHENTICATED':
      return 'errors.unauthenticated';
    case 'FORBIDDEN':
      return 'errors.forbidden';
    case 'VALIDATION':
      return 'validation.invalid';
    default:
      return 'errors.generic';
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiFailure('NETWORK');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (json?.error?.code as ApiErrorCode) ?? 'INTERNAL';
    const params = json?.params ?? (json?.error?.retryAfter ? { seconds: json.error.retryAfter } : {});
    throw new ApiFailure(code, params, json?.error?.fields ?? {});
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), token }),
  refresh: (refreshToken: string) => request<AuthTokens>('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
};
