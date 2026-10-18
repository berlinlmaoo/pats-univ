/**
 * Signed tokens for APP_QR check-in (PRODUCT.md §10.1, PLAN.md §2.1).
 *
 * App QR:  "P1.<memberId>.<nonce>.<exp>.<sig>". Issued by GET /api/me/card-token, valid for
 *          appQrTtlSeconds, and single use (the nonce is consumed when a check-in is recorded).
 * Ticket:  "T1.<adminId>.<eventId>.<memberId>.<nonce>.<exp>.<sig>". Returned by the scan preview so
 *          the crew can look at the member before confirming without racing the QR's short TTL.
 *          It is only minted for a QR that was valid at scan time, is bound to that admin and
 *          event, and carries the QR's nonce, so it can't be replayed either.
 *
 * `exp` is unix seconds in base 36; the signature is a truncated HMAC-SHA256 (128 bits).
 * Pure functions with the key passed in, so they can be unit tested without the environment.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const QR_PREFIX = 'P1';
const TICKET_PREFIX = 'T1';
/** Ids: cuid or UUID (letters, digits, "-"), never ".", so "." can separate fields. */
const ID = /^[a-z0-9-]{8,40}$/; // cuid (before the UUIDv7 conversion, 18 Oct 2026) or UUID
const NONCE = /^[A-Za-z0-9_-]{16}$/;

export interface QrClaims {
  memberId: string;
  nonce: string;
  expiresAt: Date;
}

export interface TicketClaims extends QrClaims {
  adminId: string;
  eventId: string;
}

export type TokenCheck<T> = { ok: true; claims: T } | { ok: false; reason: 'invalid' | 'expired' };

function sign(key: string, purpose: string, body: string): string {
  return createHmac('sha256', `${key}:${purpose}`).update(body).digest().subarray(0, 16).toString('base64url');
}

function signatureMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

const toExp = (d: Date) => Math.floor(d.getTime() / 1000).toString(36);
const fromExp = (s: string) => (/^[0-9a-z]{1,10}$/.test(s) ? new Date(parseInt(s, 36) * 1000) : null);

export function newNonce(): string {
  return randomBytes(12).toString('base64url');
}

export function signQr(key: string, claims: QrClaims): string {
  const body = [QR_PREFIX, claims.memberId, claims.nonce, toExp(claims.expiresAt)].join('.');
  return `${body}.${sign(key, 'app-qr', body)}`;
}

export function verifyQr(key: string, token: string, now = new Date()): TokenCheck<QrClaims> {
  const parts = token.trim().split('.');
  if (parts.length !== 5 || parts[0] !== QR_PREFIX) return { ok: false, reason: 'invalid' };
  const [, memberId, nonce, exp, sig] = parts as [string, string, string, string, string];
  const expiresAt = fromExp(exp);
  if (!ID.test(memberId) || !NONCE.test(nonce) || !expiresAt) return { ok: false, reason: 'invalid' };
  if (!signatureMatches(sign(key, 'app-qr', parts.slice(0, 4).join('.')), sig)) return { ok: false, reason: 'invalid' };
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, claims: { memberId, nonce, expiresAt } };
}

export function signTicket(key: string, claims: TicketClaims): string {
  const body = [TICKET_PREFIX, claims.adminId, claims.eventId, claims.memberId, claims.nonce, toExp(claims.expiresAt)].join('.');
  return `${body}.${sign(key, 'scan-ticket', body)}`;
}

export function verifyTicket(key: string, ticket: string, now = new Date()): TokenCheck<TicketClaims> {
  const parts = ticket.trim().split('.');
  if (parts.length !== 7 || parts[0] !== TICKET_PREFIX) return { ok: false, reason: 'invalid' };
  const [, adminId, eventId, memberId, nonce, exp, sig] = parts as [string, string, string, string, string, string, string];
  const expiresAt = fromExp(exp);
  if (!ID.test(adminId) || !ID.test(eventId) || !ID.test(memberId) || !NONCE.test(nonce) || !expiresAt) {
    return { ok: false, reason: 'invalid' };
  }
  if (!signatureMatches(sign(key, 'scan-ticket', parts.slice(0, 6).join('.')), sig)) return { ok: false, reason: 'invalid' };
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, claims: { adminId, eventId, memberId, nonce, expiresAt } };
}
