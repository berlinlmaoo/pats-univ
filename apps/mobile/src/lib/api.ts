import { errorMessageKey, type ApiErrorCode, type AuthTokens } from '@pats/shared';
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

/** i18n key for an API error code (same mapping as the web). */
export function errorKey(code: ApiFailure['code']): string {
  return errorMessageKey(code);
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

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), token }),
  send: <T>(method: Method, path: string, body: unknown, token?: string) =>
    request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body), token }),
  refresh: (refreshToken: string) => request<AuthTokens>('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
};
