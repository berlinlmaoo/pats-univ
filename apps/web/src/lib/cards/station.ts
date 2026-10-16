import 'server-only';
import {
  can,
  cardUrl,
  ENCODE_LEASE_SECONDS,
  parseCardLookup,
  type EncodeMode,
  type StationBatchesResponse,
  type StationClaimResponse,
  type StationEncodedResponse,
  type StationKeyResponse,
} from '@pats/shared';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import type { stationClaimSchema, stationEncodedSchema, stationKeySchema, stationReleaseSchema } from '@pats/shared';
import type { AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { batchLabel, cardInclude, cardKey, cardMemberSelect, toCardInfo, toCardMember } from './service';
import { isGenuineCardToken, newCardToken, tagPassword } from './token';

/**
 * Encode stations (PLAN.md §2.2, parallel encoding at HQ): the Mac Card Station, HQ phones, and a
 * city admin's phone holding an approved re-encode.
 *
 *   claim    identify a printed card (QR or NIM) and hold it for ENCODE_LEASE_SECONDS
 *   key      the chip's PWD/PACK for this UID, after the UID rules pass
 *   encoded  the chip is written and verified: bind the UID, card → ENCODED
 *   release  give the card back (operator cancelled, or the write failed: audited)
 *
 * The lease is a conditional update on the card row, so two stations racing for the same card
 * can't both hold it. Because the password is derived from the UID on the server, a station that
 * dies mid-write never leaves a chip protected with a password the server can't recompute.
 */

type ClaimInput = z.output<typeof stationClaimSchema>;
type KeyInput = z.output<typeof stationKeySchema>;
type EncodedInput = z.output<typeof stationEncodedSchema>;
type ReleaseInput = z.output<typeof stationReleaseSchema>;

const clearLease = { leaseId: null, leaseStation: null, leaseUserId: null, leaseExpiresAt: null, leaseMode: null, leaseGrantId: null };

const leaseExpiry = (now: Date) => new Date(now.getTime() + ENCODE_LEASE_SECONDS * 1000);

async function findCard(lookup: string) {
  const parsed = parseCardLookup(lookup);
  if (!parsed) throw new AppError('CARD_NOT_FOUND', 404, 'Not a card URL or NIM');
  const include = { ...cardInclude, member: { select: cardMemberSelect } };
  if (parsed.kind === 'token') {
    if (!isGenuineCardToken(cardKey(), parsed.token)) throw new AppError('CARD_INVALID', 422);
    const card = await db.card.findUnique({ where: { ndefToken: parsed.token }, include });
    if (!card) throw new AppError('CARD_NOT_FOUND', 404);
    return card;
  }
  // A NIM: the member's live card (the one not revoked), else their latest one.
  const cards = await db.card.findMany({ where: { member: { nim: parsed.nim } }, orderBy: { createdAt: 'desc' }, include });
  const card = cards.find((c) => c.status !== 'REVOKED') ?? cards[0];
  if (!card) throw new AppError('CARD_NOT_FOUND', 404);
  return card;
}

/** A re-encode approved for this admin, for this card, still unused and in time. */
async function validGrant(user: AuthUser, grantId: string, cardId: string, now: Date) {
  const grant = await db.reencodeRequest.findUnique({ where: { id: grantId } });
  if (
    !grant ||
    grant.status !== 'APPROVED' ||
    grant.requestedById !== user.id ||
    grant.cardId !== cardId ||
    grant.usedAt ||
    !grant.grantExpiresAt ||
    grant.grantExpiresAt <= now
  ) {
    throw new AppError('GRANT_INVALID', 403);
  }
  return grant;
}

export async function claimCard(user: AuthUser, input: ClaimInput, now = new Date()): Promise<StationClaimResponse> {
  const card = await findCard(input.lookup);
  let mode: EncodeMode = input.mode;
  if (input.grantId) {
    await validGrant(user, input.grantId, card.id, now);
    mode = 'reencode';
    if (input.rotateToken) throw new AppError('FORBIDDEN', 403, 'Token rotation is HQ only');
  } else if (!can(user.role, 'card.encode')) {
    throw new AppError('FORBIDDEN', 403);
  }
  if (input.batchId && card.batchId !== input.batchId) {
    throw new AppError('CARD_OTHER_BATCH', 409, 'Card belongs to another batch', { params: { batch: card.batch ? batchLabel(card.batch.city.code, card.batch.number) : '—' } });
  }
  if (card.status === 'REVOKED') throw new AppError('CARD_REVOKED', 409);
  if (!['RECEIVED_HQ', 'ENCODED', 'DELIVERED'].includes(card.status)) {
    throw new AppError('CARD_STATUS', 409, 'Card is not back at HQ', { params: { status: card.status } });
  }
  if (input.grantId && card.status !== 'DELIVERED') throw new AppError('CARD_STATUS', 409, 'Grant is for delivered cards', { params: { status: card.status } });

  const base = { card: toCardInfo(card), member: toCardMember(card.member), url: cardUrl(card.ndefToken!) };
  // Idempotent: an encoded card is reported, not written again, unless the operator asks.
  if (card.status !== 'RECEIVED_HQ' && mode === 'encode') return { ...base, lease: null, alreadyEncoded: true };
  if (card.status === 'RECEIVED_HQ') mode = 'encode';

  const leaseId = randomBytes(12).toString('base64url');
  const expiresAt = leaseExpiry(now);
  const rotate = mode === 'reencode' && input.rotateToken;
  const res = await db.card.updateMany({
    where: {
      id: card.id,
      status: card.status,
      OR: [{ leaseId: null }, { leaseExpiresAt: { lt: now } }, { leaseUserId: user.id, leaseStation: input.station }],
    },
    data: {
      leaseId,
      leaseStation: input.station,
      leaseUserId: user.id,
      leaseExpiresAt: expiresAt,
      leaseMode: mode,
      leaseGrantId: input.grantId ?? null,
      ...(rotate ? { ndefToken: newCardToken(cardKey()) } : {}),
    },
  });
  if (res.count !== 1) {
    const holder = await db.card.findUnique({ where: { id: card.id }, select: { status: true, leaseStation: true, leaseExpiresAt: true } });
    if (holder && holder.status !== card.status) throw new AppError('CARD_STATUS', 409, 'Card changed', { params: { status: holder.status } });
    const seconds = holder?.leaseExpiresAt ? Math.max(1, Math.ceil((holder.leaseExpiresAt.getTime() - now.getTime()) / 1000)) : ENCODE_LEASE_SECONDS;
    throw new AppError('CARD_CLAIMED', 409, 'Another station holds this card', { params: { station: holder?.leaseStation ?? '—', seconds } });
  }
  const fresh = await db.card.findUniqueOrThrow({ where: { id: card.id }, include: cardInclude });
  if (rotate) {
    await db.auditLog.create({ data: { actorId: user.id, action: 'card.token_rotated', targetType: 'Card', targetId: card.id, meta: { station: input.station } } });
  }
  return {
    ...base,
    card: toCardInfo(fresh),
    url: cardUrl(fresh.ndefToken!),
    lease: { id: leaseId, expiresAt: expiresAt.toISOString(), station: input.station, mode },
    alreadyEncoded: card.status !== 'RECEIVED_HQ',
  };
}

/** The card held by this lease. `allowExpired`: the write already happened, accept a late report. */
async function leased(user: AuthUser, leaseId: string, now: Date, allowExpired = false) {
  const card = await db.card.findUnique({ where: { leaseId }, include: { ...cardInclude, member: { select: cardMemberSelect } } });
  if (!card || card.leaseUserId !== user.id) throw new AppError('LEASE_LOST', 409);
  if (!allowExpired && card.leaseExpiresAt && card.leaseExpiresAt <= now) throw new AppError('LEASE_LOST', 409, 'Lease expired');
  if (card.status === 'REVOKED') throw new AppError('CARD_REVOKED', 409);
  if (card.leaseGrantId) await validGrant(user, card.leaseGrantId, card.id, now);
  return card;
}

/**
 * Which chips this card may be written to (PLAN.md §2.2): a chip bound to another live card is
 * refused; a chip of a revoked card can be reused only in re-encode mode; a card already bound to
 * another chip moves only in HQ re-encode mode and never once it is in a member's hands.
 */
async function checkUid(card: { id: string; nfcUid: string | null; status: string; leaseMode: string | null; leaseGrantId: string | null }, uid: string) {
  const reencode = card.leaseMode === 'reencode';
  const other = await db.card.findUnique({ where: { nfcUid: uid }, select: { id: true, status: true, member: { select: { nim: true } } } });
  if (other && other.id !== card.id) {
    if (other.status !== 'REVOKED' || !reencode) throw new AppError('UID_IN_USE', 409, 'Chip bound to another card', { params: { nim: other.member.nim, status: other.status } });
  }
  if (card.nfcUid && card.nfcUid !== uid) {
    const movable = reencode && !card.leaseGrantId && card.status !== 'DELIVERED';
    if (!movable) throw new AppError('CARD_UID_MISMATCH', 409, 'Card bound to another chip');
  }
  return other && other.id !== card.id ? other.id : null;
}

export async function cardKeyFor(user: AuthUser, input: KeyInput, now = new Date()): Promise<StationKeyResponse> {
  const card = await leased(user, input.leaseId, now);
  await checkUid(card, input.nfcUid);
  // Talking to the chip: keep holding the card.
  await db.card.updateMany({ where: { id: card.id, leaseId: input.leaseId }, data: { leaseExpiresAt: leaseExpiry(now) } });
  return { ...tagPassword(cardKey(), input.nfcUid), url: cardUrl(card.ndefToken!) };
}

export async function markEncoded(user: AuthUser, input: EncodedInput, now = new Date()): Promise<StationEncodedResponse> {
  const card = await leased(user, input.leaseId, now, true);
  const previousOwner = await checkUid(card, input.nfcUid);
  const first = card.status === 'RECEIVED_HQ';

  const updated = await db.$transaction(async (tx) => {
    // Reusing a revoked card's chip: the old record lets go of the UID.
    if (previousOwner) await tx.card.update({ where: { id: previousOwner }, data: { nfcUid: null } });
    const res = await tx.card.updateMany({
      where: { id: card.id, leaseId: input.leaseId, status: card.status },
      data: {
        ...clearLease,
        nfcUid: input.nfcUid,
        chipType: input.chipType,
        status: first ? 'ENCODED' : card.status,
        encodedAt: now,
        encodedByUserId: user.id,
        encodedStation: card.leaseStation,
        lockedAt: input.protectedNow || !card.lockedAt ? now : card.lockedAt,
      },
    });
    if (res.count !== 1) throw new AppError('LEASE_LOST', 409);
    if (first && card.batchId) {
      await tx.cardBatch.update({ where: { id: card.batchId }, data: { encodedCount: { increment: 1 } } });
      await tx.cardBatch.updateMany({ where: { id: card.batchId, status: 'RECEIVED_HQ' }, data: { status: 'ENCODING' } });
    }
    if (card.leaseGrantId) {
      const used = await tx.reencodeRequest.updateMany({ where: { id: card.leaseGrantId, status: 'APPROVED', usedAt: null }, data: { status: 'USED', usedAt: now } });
      if (used.count !== 1) throw new AppError('GRANT_INVALID', 403);
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: first ? 'card.encode' : 'card.reencode',
        targetType: 'Card',
        targetId: card.id,
        meta: {
          nim: card.member.nim,
          uid: input.nfcUid,
          previousUid: card.nfcUid,
          station: card.leaseStation,
          protectedNow: input.protectedNow,
          chipType: input.chipType,
          grantId: card.leaseGrantId,
          reusedFromCardId: previousOwner,
        },
      },
    });
    return tx.card.findUniqueOrThrow({ where: { id: card.id }, include: { ...cardInclude, batch: { include: { city: { select: { code: true } } } } } });
  });

  return {
    card: toCardInfo(updated),
    batch: updated.batch
      ? { id: updated.batch.id, label: batchLabel(updated.batch.city.code, updated.batch.number), cardCount: updated.batch.cardCount, encodedCount: updated.batch.encodedCount }
      : null,
  };
}

export async function releaseCard(user: AuthUser, input: ReleaseInput) {
  const card = await db.card.findUnique({ where: { leaseId: input.leaseId }, select: { id: true, leaseUserId: true, leaseStation: true, member: { select: { nim: true } } } });
  if (!card || card.leaseUserId !== user.id) return { released: false };
  await db.card.updateMany({ where: { id: card.id, leaseId: input.leaseId }, data: clearLease });
  if (input.failure) {
    await db.auditLog.create({
      data: { actorId: user.id, action: 'card.encode_failed', targetType: 'Card', targetId: card.id, meta: { nim: card.member.nim, station: card.leaseStation, failure: input.failure, detail: input.detail ?? null } },
    });
  }
  return { released: true };
}

/** Batches a station can work on: back at HQ or being encoded. */
export async function stationBatches(now = new Date()): Promise<StationBatchesResponse> {
  const batches = await db.cardBatch.findMany({
    where: { status: { in: ['RECEIVED_HQ', 'ENCODING'] } },
    orderBy: { receivedHqAt: 'asc' },
    include: { city: { select: { id: true, code: true, name: true } } },
  });
  const ids = batches.map((b) => b.id);
  const [encoded, claimed] = await Promise.all([
    db.card.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, status: { in: ['ENCODED', 'DELIVERED'] } }, _count: { _all: true } }),
    db.card.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, leaseExpiresAt: { gt: now } }, _count: { _all: true } }),
  ]);
  const count = (rows: typeof encoded, id: string) => rows.find((r) => r.batchId === id)?._count._all ?? 0;
  const live = await db.card.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, status: { not: 'REVOKED' } }, _count: { _all: true } });
  return {
    batches: batches.map((b) => ({
      id: b.id,
      label: batchLabel(b.city.code, b.number),
      city: b.city,
      status: b.status,
      cardCount: count(live, b.id),
      encodedCount: count(encoded, b.id),
      claimedCount: count(claimed, b.id),
    })),
  };
}
