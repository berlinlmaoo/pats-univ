import 'server-only';
import type { AuthTokens } from '@pats/shared';
import type { SessionClient, User } from '@/generated/prisma';
import { randomToken, sha256 } from '../crypto';
import { db } from '../db';
import { AppError } from '../http/errors';
import { signAccessToken } from './tokens';

/** App refresh tokens and dashboard cookies live this long without use. */
export const SESSION_TTL_DAYS = { APP: 60, WEB: 14 } as const;

const expiry = (client: SessionClient) => new Date(Date.now() + SESSION_TTL_DAYS[client] * 24 * 60 * 60 * 1000);

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

/** Starts a session; returns the raw secret (refresh token or cookie value), shown only once. */
export async function createSession(user: Pick<User, 'id'>, client: SessionClient, meta: SessionMeta) {
  const secret = randomToken();
  const session = await db.session.create({
    data: {
      userId: user.id,
      client,
      tokenHash: sha256(secret),
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip,
      expiresAt: expiry(client),
    },
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { session, secret };
}

export async function issueAppTokens(user: Pick<User, 'id' | 'role'>, meta: SessionMeta): Promise<AuthTokens> {
  const { session, secret } = await createSession(user, 'APP', meta);
  const access = await signAccessToken({ sub: user.id, sid: session.id, role: user.role });
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken: secret };
}

/** Rotates an app refresh token: the old one stops working, a new pair is returned. */
export async function refreshAppTokens(refreshToken: string): Promise<AuthTokens> {
  const now = new Date();
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: { select: { id: true, role: true, status: true } } },
  });
  if (!session || session.client !== 'APP' || session.revokedAt || session.expiresAt <= now) {
    throw new AppError('UNAUTHENTICATED', 401, 'Refresh token is not valid');
  }
  if (session.user.status !== 'ACTIVE') throw new AppError('ACCOUNT_DISABLED', 403, 'Account disabled');

  const secret = randomToken();
  const rotated = await db.session.updateMany({
    where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
    data: { tokenHash: sha256(secret), lastUsedAt: now, expiresAt: expiry('APP') },
  });
  // Lost a race with a parallel refresh of the same token.
  if (rotated.count !== 1) throw new AppError('UNAUTHENTICATED', 401, 'Refresh token already used');

  const access = await signAccessToken({ sub: session.user.id, sid: session.id, role: session.user.role });
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken: secret };
}

export async function revokeSessionBySecret(secret: string): Promise<void> {
  await db.session.updateMany({ where: { tokenHash: sha256(secret), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
