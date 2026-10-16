import 'server-only';
import type { Role } from '@pats/shared';
import { db } from '../db';
import { AppError } from '../http/errors';

export type Audience = 'app' | 'hq';

/** Who may log in where: HQ uses the dashboard; members and city admins use the app. */
const ALLOWED: Record<Audience, readonly Role[]> = {
  app: ['MEMBER', 'LOCAL_ADMIN'],
  hq: ['SUPER_ADMIN'],
};

export async function findLoginUser(email: string, audience: Audience) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new AppError('ACCOUNT_NOT_FOUND', 404, 'No account for this email');
  if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_DISABLED', 403, 'Account disabled');
  if (!ALLOWED[audience].includes(user.role)) {
    throw new AppError('FORBIDDEN', 403, audience === 'hq' ? 'HQ only' : 'Use the HQ dashboard');
  }
  return user;
}
