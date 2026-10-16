import { deviceSchema } from '@pats/shared';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http/respond';

/** Registers this phone's Expo push token for the signed-in user (a token moves with its owner). */
export const POST = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const input = deviceSchema.parse(await readJson(req));
  await db.device.upsert({
    where: { pushToken: input.pushToken },
    create: { userId: user.id, platform: input.platform, pushToken: input.pushToken, appVersion: input.appVersion },
    update: { userId: user.id, platform: input.platform, appVersion: input.appVersion, lastSeenAt: new Date() },
  });
  return ok({ ok: true });
});

/** Signing out: this phone stops receiving pushes. */
export const DELETE = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const { pushToken } = z.object({ pushToken: z.string().min(1) }).parse(await readJson(req));
  await db.device.deleteMany({ where: { pushToken, userId: user.id } });
  return ok({ ok: true });
});
