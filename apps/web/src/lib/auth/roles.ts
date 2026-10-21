import 'server-only';
import { can } from '@pats/shared';
import { db } from '../db';
import { AppError } from '../http/errors';
import { hit } from '../rate-limit';
import { requireApiUser, type AuthUser } from './current-user';

/**
 * App member with their profile. Inactive members are already refused by session checks.
 * Personal participation follows the membership, not the role (UX01, F03): a staff account with
 * its own member profile may use member endpoints; one without gets FORBIDDEN with
 * params.reason = NO_MEMBERSHIP so the app can show the "no personal member card" state.
 */
export async function requireMember(req: Request) {
  const user = await requireApiUser(req);
  const member = await db.member.findUnique({ where: { userId: user.id }, select: { id: true, cityId: true, status: true } });
  if (!member) throw new AppError('FORBIDDEN', 403, 'No member profile', { params: { reason: 'NO_MEMBERSHIP' } });
  if (member.status !== 'ACTIVE') throw new AppError('ACCOUNT_DISABLED', 403);
  return { user, member };
}

/** City crew in the app (HQ may call the same endpoints with its dashboard session). */
export async function requireCrew(req: Request): Promise<AuthUser> {
  const user = await requireApiUser(req);
  if (!can(user.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  return user;
}

/** Scan endpoints: generous for a busy door, tight enough to stop scripted guessing. */
export function limitScans(admin: AuthUser) {
  const r = hit(`scan:${admin.id}`, 90, 60_000);
  if (!r.ok) throw new AppError('RATE_LIMITED', 429, 'Too many scans', { retryAfter: r.retryAfter });
}
