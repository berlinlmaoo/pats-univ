import 'server-only';
import { getSetting } from '../settings';
import {
  BATCH_ACTION_FROM,
  cardUrl,
  type BatchAction,
  type CardInfo,
  type CardMember,
  type CardProfileResponse,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { hmac } from '../crypto';
import { db } from '../db';
import { isUniqueViolation } from '../db-errors';
import { env } from '../env';
import { AppError } from '../http/errors';
import { notifyUsers } from '../push/notify';
import { isGenuineCardToken, newCardToken } from './token';

type Tx = Prisma.TransactionClient;

/** Signs card tokens and derives tag passwords. Stable for the life of every card. */
export function cardKey(): string {
  return env().CARD_KEY_SECRET ?? hmac('card-key', 'dev-card-key');
}

export const batchLabel = (cityCode: string, number: number) => `${cityCode}-${number}`;

export const cardInclude = {
  batch: { select: { id: true, number: true, city: { select: { code: true } } } },
  deliveredBy: { select: { name: true } },
} satisfies Prisma.CardInclude;

export type CardWithBatch = Prisma.CardGetPayload<{ include: typeof cardInclude }>;

export function toCardInfo(c: CardWithBatch): CardInfo {
  return {
    id: c.id,
    status: c.status,
    nfcUid: c.nfcUid,
    chipType: c.chipType,
    batch: c.batch ? { id: c.batch.id, label: batchLabel(c.batch.city.code, c.batch.number) } : null,
    encodedAt: c.encodedAt?.toISOString() ?? null,
    encodedStation: c.encodedStation,
    deliveredAt: c.deliveredAt?.toISOString() ?? null,
    deliveredBy: c.deliveredBy?.name ?? null,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    revokeReason: c.revokeReason,
    createdAt: c.createdAt.toISOString(),
    isReplacement: Boolean(c.replacesCardId),
  };
}

export const cardMemberSelect = {
  id: true,
  nim: true,
  fullName: true,
  photoUrl: true,
  status: true,
  cityId: true,
  city: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, status: true } },
} satisfies Prisma.MemberSelect;

export type CardMemberRow = Prisma.MemberGetPayload<{ select: typeof cardMemberSelect }>;

export function toCardMember(m: CardMemberRow): CardMember {
  const inactive = m.status !== 'ACTIVE' || m.user.status !== 'ACTIVE';
  return { id: m.id, nim: m.nim, fullName: m.fullName, photoUrl: m.photoUrl, city: m.city, status: inactive ? 'INACTIVE' : 'ACTIVE' };
}

/** Card by the token from a printed QR or a chip; refuses forged tokens before the lookup. */
export async function cardByToken(token: string) {
  if (!isGenuineCardToken(cardKey(), token)) throw new AppError('CARD_INVALID', 422);
  const card = await db.card.findUnique({ where: { ndefToken: token }, include: { ...cardInclude, member: { select: cardMemberSelect } } });
  if (!card) throw new AppError('CARD_NOT_FOUND', 404);
  return card;
}

// ─── Batches ──────────────────────────────────────────────────────────────────

/**
 * New print batch from the queue (PRODUCT.md §4.1 step 5). Every card must be NOT_PRINTED, in
 * the batch's city, for an active member, and appear once. The update is conditional per card,
 * so two HQ tabs batching the same members can't both win: the loser gets NOT_IN_QUEUE and
 * nothing of theirs is kept.
 */
export async function createBatch(hq: AuthUser, input: { cityId: string; cardIds: string[] }) {
  const city = await db.city.findUnique({ where: { id: input.cityId } });
  if (!city) throw new AppError('CITY_NOT_FOUND', 404);
  if (input.cardIds.length === 0) throw new AppError('BATCH_EMPTY', 422);

  const cards = await db.card.findMany({
    where: { id: { in: input.cardIds } },
    include: { member: { select: { id: true, nim: true, cityId: true, status: true, user: { select: { status: true } } } } },
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const seenMembers = new Map<string, string>();
  const seenCards = new Set<string>();
  for (const id of input.cardIds) {
    const card = byId.get(id);
    if (!card || card.status !== 'NOT_PRINTED' || card.batchId) throw new AppError('NOT_IN_QUEUE', 409);
    if (seenCards.has(id) || seenMembers.has(card.memberId)) {
      throw new AppError('BATCH_DUPLICATE_MEMBER', 422, 'Member twice in one batch', { params: { nim: card.member.nim } });
    }
    seenCards.add(id);
    seenMembers.set(card.memberId, id);
    if (card.member.cityId !== city.id) throw new AppError('BATCH_MIXED_CITIES', 422, 'Card from another city', { params: { nim: card.member.nim } });
    if (card.member.status !== 'ACTIVE' || card.member.user.status !== 'ACTIVE') {
      throw new AppError('MEMBER_INACTIVE', 409, 'Member is deactivated', { params: { nim: card.member.nim } });
    }
  }

  const key = cardKey();
  for (let attempt = 0; ; attempt++) {
    try {
      const batch = await db.$transaction(async (tx) => {
        const last = await tx.cardBatch.aggregate({ where: { cityId: city.id }, _max: { number: true } });
        const created = await tx.cardBatch.create({
          data: { cityId: city.id, number: (last._max.number ?? 0) + 1, cardCount: input.cardIds.length, createdById: hq.id },
        });
        for (const id of input.cardIds) {
          const res = await tx.card.updateMany({
            where: { id, status: 'NOT_PRINTED', batchId: null },
            data: { status: 'IN_BATCH', batchId: created.id, ndefToken: newCardToken(key) },
          });
          if (res.count !== 1) throw new AppError('NOT_IN_QUEUE', 409);
        }
        await tx.auditLog.create({
          data: { actorId: hq.id, action: 'batch.create', targetType: 'CardBatch', targetId: created.id, meta: { city: city.code, number: created.number, cards: input.cardIds.length } },
        });
        return created;
      });
      return batch;
    } catch (err) {
      // Two batches for the same city at once: take the next number and try again.
      if (isUniqueViolation(err) && attempt < 2) continue;
      throw err;
    }
  }
}

/** HQ moves a batch along: to the vendor, back at HQ, shipped to the city. */
export async function batchAction(hq: AuthUser, batchId: string, action: BatchAction, now = new Date()) {
  const batch = await db.cardBatch.findUnique({ where: { id: batchId }, include: { city: true } });
  if (!batch) throw new AppError('NOT_FOUND', 404);
  if (!BATCH_ACTION_FROM[action].includes(batch.status)) throw new AppError('BATCH_STATUS', 409);

  if (action === 'sendToVendor') {
    if (!batch.batchPdfUrl) throw new AppError('FILES_FAILED', 409, 'Print files not generated');
    await db.$transaction(async (tx) => {
      const res = await tx.cardBatch.updateMany({ where: { id: batchId, status: 'EXPORTED' }, data: { status: 'SENT_TO_VENDOR', sentToVendorAt: now } });
      if (res.count !== 1) throw new AppError('BATCH_STATUS', 409);
      await tx.card.updateMany({ where: { batchId, status: 'IN_BATCH' }, data: { status: 'SENT_TO_VENDOR' } });
      await tx.auditLog.create({ data: { actorId: hq.id, action: 'batch.sent_to_vendor', targetType: 'CardBatch', targetId: batchId } });
    });
  } else if (action === 'receiveAtHq') {
    await db.$transaction(async (tx) => {
      const res = await tx.cardBatch.updateMany({ where: { id: batchId, status: 'SENT_TO_VENDOR' }, data: { status: 'RECEIVED_HQ', receivedHqAt: now } });
      if (res.count !== 1) throw new AppError('BATCH_STATUS', 409);
      await tx.card.updateMany({ where: { batchId, status: 'SENT_TO_VENDOR' }, data: { status: 'RECEIVED_HQ' } });
      await tx.auditLog.create({ data: { actorId: hq.id, action: 'batch.received_hq', targetType: 'CardBatch', targetId: batchId } });
    });
  } else {
    const [pending, encoded] = await Promise.all([
      db.card.count({ where: { batchId, status: { in: ['IN_BATCH', 'SENT_TO_VENDOR', 'RECEIVED_HQ'] } } }),
      db.card.findMany({ where: { batchId, status: 'ENCODED' }, select: { member: { select: { userId: true } } } }),
    ]);
    if (pending > 0) throw new AppError('BATCH_NOT_ENCODED', 409, 'Cards still to encode', { params: { count: pending } });
    await db.$transaction(async (tx) => {
      const res = await tx.cardBatch.updateMany({
        where: { id: batchId, status: { in: ['RECEIVED_HQ', 'ENCODING'] } },
        data: { status: 'SHIPPED_TO_CITY', shippedToCityAt: now },
      });
      if (res.count !== 1) throw new AppError('BATCH_STATUS', 409);
      await tx.auditLog.create({ data: { actorId: hq.id, action: 'batch.shipped', targetType: 'CardBatch', targetId: batchId, meta: { cards: encoded.length } } });
      await completeBatchIfDone(tx, batchId);
    });
    // "Your card has reached {city}" (PRODUCT.md §8).
    await notifyUsers(
      encoded.map((c) => c.member.userId),
      { kind: 'cardShipped', cityId: batch.cityId, values: { city: batch.city.name }, data: { screen: 'card' } },
    );
  }
}

/** A shipped batch is done once no card in it is still waiting for its hand-over. */
export async function completeBatchIfDone(tx: Tx, batchId: string | null) {
  if (!batchId) return;
  const open = await tx.card.count({ where: { batchId, status: { notIn: ['DELIVERED', 'REVOKED'] } } });
  if (open === 0) await tx.cardBatch.updateMany({ where: { id: batchId, status: 'SHIPPED_TO_CITY' }, data: { status: 'DONE' } });
}

/** A batch created by mistake, before it went to the vendor: its cards go back to the queue. */
export async function cancelBatch(hq: AuthUser, batchId: string) {
  const batch = await db.cardBatch.findUnique({ where: { id: batchId }, include: { cards: { select: { printFileUrl: true } } } });
  if (!batch) throw new AppError('NOT_FOUND', 404);
  if (batch.status !== 'EXPORTED') throw new AppError('BATCH_STATUS', 409);
  await db.$transaction(async (tx) => {
    await tx.card.updateMany({
      where: { batchId, status: 'IN_BATCH' },
      data: { status: 'NOT_PRINTED', batchId: null, ndefToken: null, printFileUrl: null },
    });
    // Cards revoked while in this batch keep their history but leave it.
    await tx.card.updateMany({ where: { batchId }, data: { batchId: null } });
    const res = await tx.cardBatch.deleteMany({ where: { id: batchId, status: 'EXPORTED' } });
    if (res.count !== 1) throw new AppError('BATCH_STATUS', 409);
    await tx.auditLog.create({ data: { actorId: hq.id, action: 'batch.cancel', targetType: 'CardBatch', targetId: batchId, meta: { cards: batch.cardCount } } });
  });
  return batch;
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

/**
 * Lost or damaged card (PRODUCT.md §5.2): REVOKED, so its token and UID are refused for good, and
 * a replacement goes straight back into the print queue. Used by HQ and by city crew.
 */
export async function revokeCard(actor: AuthUser, cardId: string, reason: string, now = new Date()) {
  const card = await db.card.findUnique({ where: { id: cardId }, include: { member: { select: { id: true, cityId: true, nim: true } } } });
  if (!card) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(actor, card.member.cityId);
  if (card.status === 'REVOKED') throw new AppError('CARD_REVOKED', 409);
  // A queue entry isn't a physical card yet: there is nothing to lose.
  if (card.status === 'NOT_PRINTED') throw new AppError('CARD_STATUS', 409, 'Card not printed yet', { params: { status: card.status } });

  return db.$transaction(async (tx) => {
    const res = await tx.card.updateMany({
      where: { id: cardId, status: { not: 'REVOKED' } },
      data: { status: 'REVOKED', revokedAt: now, revokeReason: reason, leaseId: null, leaseStation: null, leaseUserId: null, leaseExpiresAt: null, leaseMode: null, leaseGrantId: null },
    });
    if (res.count !== 1) throw new AppError('CARD_REVOKED', 409);
    await tx.reencodeRequest.updateMany({ where: { cardId, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'EXPIRED' } });
    const replacement = await tx.card.create({ data: { memberId: card.memberId, status: 'NOT_PRINTED', replacesCardId: card.id, replacementFee: await getSetting(tx, 'cardReplacementFee') } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'card.revoke',
        targetType: 'Card',
        targetId: cardId,
        meta: { nim: card.member.nim, from: card.status, reason, uid: card.nfcUid, replacementId: replacement.id },
      },
    });
    await completeBatchIfDone(tx, card.batchId);
    return { replacementId: replacement.id };
  });
}

// ─── Public card page ─────────────────────────────────────────────────────────

/**
 * What /c/<token> shows (PRODUCT.md §4.1, §10.3). Song, genre and quote are on the digital
 * profile only; a revoked or unknown card shows nothing personal, and DOB never appears.
 */
export async function cardProfile(token: string, viewerMemberId?: string | null): Promise<CardProfileResponse | null> {
  if (!isGenuineCardToken(cardKey(), token)) return null;
  const card = await db.card.findUnique({
    where: { ndefToken: token },
    include: { member: { include: { city: { select: { name: true } }, user: { select: { status: true } } } } },
  });
  if (!card) return null;
  const m = card.member;
  const isMine = Boolean(viewerMemberId && viewerMemberId === m.id);
  if (card.status === 'REVOKED') return { state: 'revoked', member: null, isMine };
  if (m.status !== 'ACTIVE' || m.user.status !== 'ACTIVE') return { state: 'inactive', member: null, isMine };
  return {
    state: card.status === 'DELIVERED' ? 'active' : 'pending',
    isMine,
    member: {
      fullName: m.fullName,
      nim: m.nim,
      city: m.city.name,
      joinedAt: m.joinedAt.toISOString(),
      favoriteSong: m.favoriteSong,
      favoriteGenre: m.favoriteGenre,
      quotes: m.quotes,
    },
  };
}

export { cardUrl };
