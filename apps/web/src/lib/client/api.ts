import type { ApiErrorCode } from '@pats/shared';
import { ERROR_MESSAGE_KEY } from '../http/errors';

export interface ClientApiError {
  code: ApiErrorCode | 'NETWORK';
  /** i18n key + params for the top-level message. */
  messageKey: string;
  params?: Record<string, string | number>;
  /** Field -> i18n key. */
  fields: Record<string, string>;
  retryAfter?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ClientApiError };

/** JSON POST to our own API; never throws. */
export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: 'NETWORK', messageKey: 'errors.network', fields: {} } };
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: json as T };
  const code: ApiErrorCode = json?.error?.code ?? 'INTERNAL';
  return {
    ok: false,
    error: {
      code,
      messageKey: ERROR_MESSAGE_KEY[code] ?? 'errors.generic',
      params: json?.params ?? (json?.error?.retryAfter ? { seconds: json.error.retryAfter } : undefined),
      fields: json?.error?.fields ?? {},
      retryAfter: json?.error?.retryAfter,
    },
  };
}
