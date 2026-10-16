import 'server-only';
import {
  can,
  REENCODE_GRANT_HOURS,
  type Capability,
  type CrewCardSearchResponse,
  type CrewMemberCardsResponse,
  type HandoverPreviewResponse,
  type HandoverResponse,
  type ReencodeRequestInfo,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { isUniqueViolation } from '../db-errors';
import { AppError } from '../http/errors';
import { notifyUsers } from '../push/notify';
import { cardByToken, cardInclude, cardMemberSelect, completeBatchIfDone, revokeCard, toCardInfo, toCardMember } from './service';

export function requireCapability(user: AuthUser, capability: Capability) {
  if (!can(user.role, capability)) throw new AppError('FORBIDDEN', 403);
}

// ─── Hand-over (PRODUCT.md §4.1 step 8) ───────────────────────────────────────

/** Tap at hand-over: whose card is this, and can it be handed over? Records nothing. */
export async function previewHandover(admin: AuthUser, input: { token: string; nfcUid: string }): Promise<HandoverPreviewResponse> {
  requireCapability(admin, 'card.handover');
  const card = await cardByToken(input.token);
  if (card.status === 'REVOKED') throw new AppError('CARD_REVOKED', 409);
  if (card.status !== 'ENCODED' && card.status !== 'DELIVERED') throw new AppError('CARD_NOT_ENCODED', 409);
  if (card.nfcUid !== input.nfcUid) throw new AppError('CARD_UID_MISMATCH', 409);
  const member = toCardMember(card.member);
  let issue: HandoverPreviewResponse['issue'] = null;
  if (!can(admin.role, 'hq.manage') && card.member.cityId !== admin.cityId) issue = { code: 'OTHER_CITY' };
  else if (member.status !== 'ACTIVE') issue = { code: 'MEMBER_INACTIVE' };
  else if (card.status === 'DELIVERED') issue = { code: 'ALREADY_DELIVERED', at: card.deliveredAt?.toISOString(), by: card.deliveredBy?.name ?? undefined };
  return { card: toCardInfo(card), member, issue };
}

/** Confirms the member received this card: ENCODED → DELIVERED. No new binding happens here. */
export async function handOverCard(admin: AuthUser, input: { token: string; nfcUid: string }, now = new Date()): Promise<HandoverResponse> {
  const preview = await previewHandover(admin, input);
  if (preview.issue?.code === 'ALREADY_DELIVERED') throw new AppError('CARD_ALREADY_DELIVERED', 409, 'Already handed over', { params: { by: preview.issue.by ?? '' } });
  if (preview.issue?.code === 'OTHER_CITY') throw new AppError('FORBIDDEN', 403, 'Member of another city');
  if (preview.issue?.code === 'MEMBER_INACTIVE') throw new AppError('MEMBER_INACTIVE', 409);

  const card = await db.$transaction(async (tx) => {
    let res;
    try {
      res = await tx.card.updateMany({
        where: { id: preview.card.id, status: 'ENCODED', nfcUid: input.nfcUid },
        data: { status: 'DELIVERED', deliveredAt: now, deliveredByAdminId: admin.id },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CARD_ALREADY_DELIVERED', 409);
      throw err;
    }
    if (res.count !== 1) throw new AppError('CARD_ALREADY_DELIVERED', 409);
    await tx.auditLog.create({
      data: { actorId: admin.id, action: 'card.deliver', targetType: 'Card', targetId: preview.card.id, meta: { nim: preview.member.nim, uid: input.nfcUid } },
    });
    const row = await tx.card.findUniqueOrThrow({ where: { id: preview.card.id }, include: { ...cardInclude, member: { select: { ...cardMemberSelect, userId: true } } } });
    await completeBatchIfDone(tx, row.batchId);
    return row;
  });
  await notifyUsers([card.member.userId], { kind: 'cardDelivered', cityId: card.member.cityId, values: { city: card.member.city.name }, data: { screen: 'card' } });
  return { card: toCardInfo(card), member: toCardMember(card.member) };
}

// ─── Member cards (lost / damaged / re-encode) ───────────────────────────────

const liveCardWhere = { status: { not: 'REVOKED' } } satisfies Prisma.CardWhereInput;

/** Members of the admin's city by name or NIM, with their live card. */
export async function searchCardMembers(admin: AuthUser, q: string): Promise<CrewCardSearchResponse> {
  requireCapability(admin, 'card.reportLost');
  const term = q.trim();
  if (term.length < 2) return { members: [] };
  const members = await db.member.findMany({
    where: {
      ...(!can(admin.role, 'hq.manage') ? { cityId: admin.cityId ?? '__none__' } : {}),
      OR: [{ fullName: { contains: term, mode: 'insensitive' } }, { nim: { contains: term.toUpperCase() } }],
    },
    orderBy: { fullName: 'asc' },
    take: 20,
    select: { ...cardMemberSelect, cards: { where: liveCardWhere, include: cardInclude, take: 1 } },
  });
  return { members: members.map((m) => ({ ...toCardMember(m), card: m.cards[0] ? toCardInfo(m.cards[0]) : null })) };
}

const requestInclude = { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } satisfies Prisma.ReencodeRequestInclude;

export function toReencodeInfo(r: Prisma.ReencodeRequestGetPayload<{ include: typeof requestInclude }>, now = new Date(), viewerId?: string): ReencodeRequestInfo {
  const lapsed = r.status === 'APPROVED' && r.grantExpiresAt && r.grantExpiresAt <= now;
  return {
    id: r.id,
    status: lapsed ? 'EXPIRED' : r.status,
    reason: r.reason,
    requestedBy: r.requestedBy.name,
    createdAt: r.createdAt.toISOString(),
    decidedBy: r.decidedBy?.name ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decisionNote: r.decisionNote,
    grantExpiresAt: r.grantExpiresAt?.toISOString() ?? null,
    usedAt: r.usedAt?.toISOString() ?? null,
    mine: r.requestedById === viewerId,
  };
}

export async function memberCards(admin: AuthUser, memberId: string, now = new Date()): Promise<CrewMemberCardsResponse> {
  requireCapability(admin, 'card.reportLost');
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { ...cardMemberSelect, cards: { orderBy: { createdAt: 'desc' }, include: { ...cardInclude, reencodeRequests: { orderBy: { createdAt: 'desc' }, take: 1, include: requestInclude } } } },
  });
  if (!member) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(admin, member.cityId);
  const live = member.cards.find((c) => c.status !== 'REVOKED');
  const ordered = live ? [live, ...member.cards.filter((c) => c !== live)] : member.cards;
  const request = live?.reencodeRequests[0];
  return {
    member: toCardMember(member),
    cards: ordered.map(toCardInfo),
    reencode: request ? toReencodeInfo(request, now, admin.id) : null,
  };
}

export async function reportLost(admin: AuthUser, cardId: string, reason: string) {
  requireCapability(admin, 'card.reportLost');
  return revokeCard(admin, cardId, reason);
}

/**
 * A delivered card is damaged but its chip still answers: the admin asks HQ for one re-encode.
 * Gated by capability, not role, so a future regional role can be given it (open question S1).
 */
export async function requestReencode(admin: AuthUser, cardId: string, reason: string, now = new Date()) {
  requireCapability(admin, 'card.requestReencode');
  const card = await db.card.findUnique({ where: { id: cardId }, include: { member: { select: { cityId: true, nim: true } } } });
  if (!card) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(admin, card.member.cityId);
  if (card.status === 'REVOKED') throw new AppError('CARD_REVOKED', 409);
  if (card.status !== 'DELIVERED') throw new AppError('CARD_NOT_DELIVERED', 409);
  // Grants that ran out stop counting as open.
  await db.reencodeRequest.updateMany({ where: { cardId, status: 'APPROVED', grantExpiresAt: { lte: now } }, data: { status: 'EXPIRED' } });
  try {
    const request = await db.reencodeRequest.create({ data: { cardId, requestedById: admin.id, reason }, include: requestInclude });
    await db.auditLog.create({ data: { actorId: admin.id, action: 'card.reencode_request', targetType: 'Card', targetId: cardId, meta: { nim: card.member.nim, reason, requestId: request.id } } });
    return toReencodeInfo(request, now, admin.id);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError('REQUEST_PENDING', 409);
    throw err;
  }
}

/** HQ approves (one encode within 24 hours, by the requester only) or rejects. */
export async function decideReencode(hq: AuthUser, requestId: string, approve: boolean, note: string | undefined, now = new Date()) {
  requireCapability(hq, 'card.decideReencode');
  const request = await db.reencodeRequest.findUnique({ where: { id: requestId }, include: { card: { include: { member: { select: { nim: true, fullName: true } } } } } });
  if (!request) throw new AppError('NOT_FOUND', 404);
  if (request.card.status !== 'DELIVERED' && approve) throw new AppError('CARD_NOT_DELIVERED', 409);
  const grantExpiresAt = approve ? new Date(now.getTime() + REENCODE_GRANT_HOURS * 3600_000) : null;
  const res = await db.reencodeRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: hq.id, decidedAt: now, decisionNote: note || null, grantExpiresAt },
  });
  if (res.count !== 1) throw new AppError('REQUEST_DECIDED', 409);
  await db.auditLog.create({
    data: {
      actorId: hq.id,
      action: approve ? 'card.reencode_approve' : 'card.reencode_reject',
      targetType: 'Card',
      targetId: request.cardId,
      meta: { requestId, nim: request.card.member.nim, note: note ?? null, grantExpiresAt: grantExpiresAt?.toISOString() ?? null },
    },
  });
  await notifyUsers([request.requestedById], {
    kind: approve ? 'reencodeApproved' : 'reencodeRejected',
    values: { member: request.card.member.fullName, nim: request.card.member.nim },
    data: { screen: 'memberCard', memberId: request.card.memberId, approved: approve ? '1' : '0' },
  });
}
