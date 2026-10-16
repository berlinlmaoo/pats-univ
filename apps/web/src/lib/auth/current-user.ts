import 'server-only';
import { can } from '@pats/shared';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Role, User } from '@/generated/prisma';
import { sha256 } from '../crypto';
import { db } from '../db';
import { AppError } from '../http/errors';
import { verifyAccessToken } from './tokens';

export const SESSION_COOKIE = 'pats_session';

export type AuthUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'cityId' | 'status' | 'locale'>;

const userSelect = { id: true, email: true, name: true, role: true, cityId: true, status: true, locale: true } as const;

/** Re-check the session in the database at most this often per request burst. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

async function userFromWebCookie(): Promise<AuthUser | null> {
  const secret = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!secret) return null;
  const now = new Date();
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(secret) },
    include: { user: { select: userSelect } },
  });
  if (!session || session.client !== 'WEB' || session.revokedAt || session.expiresAt <= now) return null;
  if (session.user.status !== 'ACTIVE') return null;
  if (now.getTime() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: now } });
  }
  return session.user;
}

async function userFromBearer(header: string | null): Promise<AuthUser | null> {
  if (!header?.startsWith('Bearer ')) return null;
  const claims = await verifyAccessToken(header.slice(7));
  if (!claims) return null;
  const session = await db.session.findUnique({
    where: { id: claims.sid },
    select: { revokedAt: true, expiresAt: true, user: { select: userSelect } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.id !== claims.sub) return null;
  if (session.user.status !== 'ACTIVE') return null;
  return session.user;
}

/** Signed-in dashboard user for server components and actions (memoised per request). */
export const getWebUser = cache(userFromWebCookie);

/** Signed-in user for API routes: app bearer token first, then the dashboard cookie. */
export async function getApiUser(req: Request): Promise<AuthUser | null> {
  return (await userFromBearer(req.headers.get('authorization'))) ?? (await userFromWebCookie());
}

export async function requireApiUser(req: Request, roles?: readonly Role[]): Promise<AuthUser> {
  const user = await getApiUser(req);
  if (!user) throw new AppError('UNAUTHENTICATED', 401);
  if (roles && !roles.some(role => role === 'SUPER_ADMIN' ? can(user.role, 'hq.manage') : role === 'REGIONAL_ADMIN' ? can(user.role, 'city.operations') : user.role === 'MEMBER')) throw new AppError('FORBIDDEN', 403);
  return user;
}

/** Local admins only reach their own city; HQ reaches every city. */
export function requireCityAccess(user: AuthUser, cityId: string): void {
  if (can(user.role, 'hq.manage')) return;
  if (can(user.role, 'city.operations') && user.cityId === cityId) return;
  throw new AppError('FORBIDDEN', 403, 'No access to this city');
}
