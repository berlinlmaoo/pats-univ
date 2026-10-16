/**
 * Card secrets (PLAN.md §2.2, PRODUCT.md §10.1).
 *
 * Card token: 16 random base64url characters + 16 characters of HMAC over them (96-bit). It is
 *   printed as the QR and written to the chip as https://patsuniv.znetworks.id/c/<token>. The
 *   signature lets the server reject made-up tokens before touching the database; the token is
 *   unique in the DB either way.
 * Tag password: NTAG213 PWD (4 bytes) and PACK (2 bytes) derived from the card key and the chip
 *   UID. Never stored: HQ recomputes it for any re-encode. Only the server knows the card key;
 *   stations get the PWD for one UID, for one write.
 * NFC scan ticket: like the APP_QR ticket, it lets the crew look at a tapped member before
 *   confirming. "N1.<adminId>.<eventId>.<memberId>.<cardId>.<exp>.<sig>".
 *
 * Pure functions with the key passed in, so they can be unit tested without the environment.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CARD_TOKEN_PATTERN } from '@pats/shared';

const mac = (key: string, purpose: string, body: string) => createHmac('sha256', `${key}:${purpose}`).update(body).digest();

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function newCardToken(key: string): string {
  const id = randomBytes(12).toString('base64url');
  return id + mac(key, 'card-token', id).subarray(0, 12).toString('base64url');
}

export function isGenuineCardToken(key: string, token: string): boolean {
  if (!CARD_TOKEN_PATTERN.test(token)) return false;
  const id = token.slice(0, 16);
  return same(mac(key, 'card-token', id).subarray(0, 12).toString('base64url'), token.slice(16));
}

/** PWD/PACK for a chip. Avoids the factory default (FFFFFFFF) and all-zero values. */
export function tagPassword(cardKey: string, uid: string): { pwd: string; pack: string } {
  for (let round = 0; ; round++) {
    const d = mac(cardKey, 'ntag213-pwd', `${uid.toUpperCase()}:${round}`);
    const pwd = d.subarray(0, 4).toString('hex').toUpperCase();
    const pack = d.subarray(4, 6).toString('hex').toUpperCase();
    if (pwd !== 'FFFFFFFF' && pwd !== '00000000' && pack !== '0000') return { pwd, pack };
  }
}

const ID = /^[a-z0-9]{8,40}$/;
const toExp = (d: Date) => Math.floor(d.getTime() / 1000).toString(36);
const fromExp = (s: string) => (/^[0-9a-z]{1,10}$/.test(s) ? new Date(parseInt(s, 36) * 1000) : null);

export interface NfcTicketClaims {
  adminId: string;
  eventId: string;
  memberId: string;
  cardId: string;
  expiresAt: Date;
}

export function signNfcTicket(key: string, c: NfcTicketClaims): string {
  const body = ['N1', c.adminId, c.eventId, c.memberId, c.cardId, toExp(c.expiresAt)].join('.');
  return `${body}.${mac(key, 'nfc-ticket', body).subarray(0, 16).toString('base64url')}`;
}

export function verifyNfcTicket(
  key: string,
  ticket: string,
  now = new Date(),
): { ok: true; claims: NfcTicketClaims } | { ok: false; reason: 'invalid' | 'expired' } {
  const parts = ticket.trim().split('.');
  if (parts.length !== 7 || parts[0] !== 'N1') return { ok: false, reason: 'invalid' };
  const [, adminId, eventId, memberId, cardId, exp, sig] = parts as [string, string, string, string, string, string, string];
  const expiresAt = fromExp(exp);
  if (![adminId, eventId, memberId, cardId].every((v) => ID.test(v)) || !expiresAt) return { ok: false, reason: 'invalid' };
  if (!same(mac(key, 'nfc-ticket', parts.slice(0, 6).join('.')).subarray(0, 16).toString('base64url'), sig)) return { ok: false, reason: 'invalid' };
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, claims: { adminId, eventId, memberId, cardId, expiresAt } };
}
