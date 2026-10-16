/**
 * Fixed-window in-memory limiter for abuse-prone endpoints (OTP, registration). One web process
 * serves the prototype; per-email limits that must survive restarts are enforced in the database
 * (see otp/service.ts).
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export interface LimitResult {
  ok: boolean;
  retryAfter: number;
}

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) sweep(now);
    return { ok: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count > limit) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

function sweep(now: number) {
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}
