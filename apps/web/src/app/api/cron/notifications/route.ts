import { safeEqual } from '@/lib/crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { runNotificationCron } from '@/lib/push/cron';

/** Reminders H-3/H-1/H and the day-after follow-ups. Called by the server's systemd timer. */
export const POST = route(async (req: Request) => {
  const secret = env().CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || !safeEqual(given, secret)) throw new AppError('UNAUTHENTICATED', 401);
  return ok(await runNotificationCron());
});
