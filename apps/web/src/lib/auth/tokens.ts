import 'server-only';
import type { Role } from '@pats/shared';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../env';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'pats-univ';

export interface AccessClaims {
  sub: string;
  sid: string;
  role: Role;
}

const key = () => new TextEncoder().encode(`${env().AUTH_SECRET}:access`);

export async function signAccessToken(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.role !== 'string') {
      return null;
    }
    return { sub: payload.sub, sid: payload.sid, role: payload.role as Role };
  } catch {
    return null;
  }
}
