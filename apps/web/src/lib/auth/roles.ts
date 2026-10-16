import 'server-only';
import { can } from '@pats/shared';
import { db } from '../db';
import { AppError } from '../http/errors';
import { hit } from '../rate-limit';
import { requireApiUser, type AuthUser } from './current-user';

/** App member with their profile. Inactive members are already refused by session checks. */
export async function requireMember(req: Request) {
  const user = await requireApiUser(req, ['MEMBER']);
  const member = await db.member.findUnique({ where: { userId: user.id }, select: { id: true, cityId: true, status: true } });
  if (!member) throw new AppError('FORBIDDEN', 403, 'No member profile');
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
