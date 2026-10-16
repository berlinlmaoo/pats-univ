import 'server-only';
import { fieldErrors, type ApiError } from '@pats/shared';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './errors';

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown): NextResponse<ApiError & { params?: Record<string, string | number> }> {
  if (err instanceof AppError) {
    const headers = err.extra.retryAfter ? { 'Retry-After': String(err.extra.retryAfter) } : undefined;
    return NextResponse.json(
      {
        error: { code: err.code, message: err.message, fields: err.extra.fields, retryAfter: err.extra.retryAfter },
        params: err.extra.params,
      },
      { status: err.status, headers },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid input', fields: fieldErrors(err) } },
      { status: 422 },
    );
  }
  console.error('[api] unhandled error', err);
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Internal error' } }, { status: 500 });
}

/** Wraps a route handler so thrown AppError/ZodError become JSON responses. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError('VALIDATION', 400, 'Body must be JSON');
  }
}

/** Client IP behind the reverse proxy / tunnel. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
