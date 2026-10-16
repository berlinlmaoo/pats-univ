import 'server-only';
import { can } from '@pats/shared';
import { db } from '../db';
import { AppError } from '../http/errors';

export type Audience = 'app' | 'hq';

/**
 * Who may log in where. Members and city admins use the app; HQ uses the dashboard and, since
 * Phase 2, the app too (encoding cards on a phone) and the Mac Card Station.
 */
export async function findLoginUser(email: string, audience: Audience) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new AppError('ACCOUNT_NOT_FOUND', 404, 'No account for this email');
  if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_DISABLED', 403, 'Account disabled');
  if (audience === 'hq' && !can(user.role, 'dashboard.access')) {
    throw new AppError('FORBIDDEN', 403, audience === 'hq' ? 'HQ only' : 'Use the HQ dashboard');
  }
  return user;
}
