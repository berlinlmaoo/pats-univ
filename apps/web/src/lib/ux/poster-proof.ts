import 'server-only';
import { randomUUID } from 'node:crypto';
import { can, createTranslator, posterProofDecisionSchema, type PosterProofInfo } from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { POSTER_MAX_BYTES, POSTER_TYPES } from '../events/content';
import { AppError } from '../http/errors';
import { atomic } from '../loyalty/transaction';
import { creditXp } from '../loyalty/xp';
import { notifyUsers } from '../push/notify';
import { getSetting } from '../settings';
import { publish } from '../social/realtime';
import { storage } from '../storage';
import type { ActiveMember } from './member';

/**
 * "Blast poster" (owner, 22 Oct 2026): an optional journey step. The member shares the event poster
 * and uploads a screenshot; crew of the event's city (or HQ) approves → +posterShareXp once through
 * the normal XP ledger (award key poster:<proofId>). One proof per member and event; a rejected
 * proof can be sent again, an approved one can't.
 */

type ProofRow = { id: string; status: string; createdAt: Date; updatedAt: Date; reviewedAt: Date | null; rejectReason: string | null; xpAwarded: number | null };

export function toProofInfo(p: ProofRow): PosterProofInfo {
  return {
    id: p.id,
    status: p.status as PosterProofInfo['status'],
    imageUrl: `/api/poster-proofs/${p.id}/image?v=${p.updatedAt.getTime()}`,
    submittedAt: p.updatedAt.toISOString(),
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    rejectReason: p.rejectReason,
    xpAwarded: p.xpAwarded,
  };
}

export async function proofFor(memberId: string, eventId: string) {
  const row = await db.posterProof.findUnique({ where: { memberId_eventId: { memberId, eventId } } });
  return row ? toProofInfo(row) : null;
}

export async function submitPosterProof(member: ActiveMember, eventId: string, file: File | null) {
  const event = await db.event.findFirst({ where: { id: eventId, status: { not: 'DRAFT' } }, select: { id: true, flyerUrl: true } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  if (!event.flyerUrl) throw new AppError('VALIDATION', 422, 'No poster', { fields: { eventId: 'ux.posterProof.noPoster' } });
  if (!(file instanceof File) || file.size === 0) throw new AppError('VALIDATION', 422, 'Image required', { fields: { image: 'validation.flyerRequired' } });
  const ext = POSTER_TYPES[file.type];
  if (!ext) throw new AppError('VALIDATION', 422, 'Image type', { fields: { image: 'validation.flyerType' } });
  if (file.size > POSTER_MAX_BYTES) throw new AppError('VALIDATION', 422, 'Image size', { fields: { image: 'validation.flyerTooLarge' } });
  const existing = await db.posterProof.findUnique({ where: { memberId_eventId: { memberId: member.id, eventId } } });
  if (existing?.status === 'APPROVED') throw new AppError('REQUEST_DECIDED', 409, 'Already approved', { fields: { image: 'ux.posterProof.alreadyApproved' } });
  const key = `poster-proofs/${member.id}/${randomUUID()}.${ext}`;
  await storage().put(key, new Uint8Array(await file.arrayBuffer()), file.type);
  const row = await atomic(async (tx) => {
    const current = await tx.posterProof.findUnique({ where: { memberId_eventId: { memberId: member.id, eventId } } });
    if (current?.status === 'APPROVED') throw new AppError('REQUEST_DECIDED', 409);
    const saved = current
      ? await tx.posterProof.update({ where: { id: current.id }, data: { imageKey: key, status: 'PENDING', reviewedAt: null, reviewedById: null, rejectReason: null } })
      : await tx.posterProof.create({ data: { memberId: member.id, eventId, imageKey: key } });
    await tx.auditLog.create({ data: { actorId: null, action: current ? 'poster.proof.resubmitted' : 'poster.proof.submitted', targetType: 'PosterProof', targetId: saved.id, meta: { memberId: member.id, eventId } } });
    return { saved, oldKey: current?.imageKey ?? null };
  });
  if (row.oldKey && row.oldKey !== key) await storage().remove(row.oldKey).catch(() => undefined);
  return toProofInfo(row.saved);
}

const queueInclude = {
  member: { select: { id: true, fullName: true, nim: true } },
  event: { select: { id: true, title: true, cityId: true, startsAt: true, city: { select: { name: true } } } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.PosterProofInclude;

/** Crew queue (pending first, oldest first), scoped to the admin's city; HQ sees every city. */
export async function proofQueue(admin: AuthUser, filters: { status?: string | null; eventId?: string | null } = {}) {
  if (!can(admin.role, 'promoter.manage')) throw new AppError('FORBIDDEN', 403);
  const status = filters.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(filters.status) ? filters.status : undefined;
  const rows = await db.posterProof.findMany({
    where: { ...(status ? { status } : {}), ...(filters.eventId ? { eventId: filters.eventId } : {}), event: { cityId: can(admin.role, 'hq.manage') ? undefined : admin.cityId! } },
    include: queueInclude,
    orderBy: [{ reviewedAt: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'asc' }],
    take: 200,
  });
  const xpByCity = new Map<string, number>();
  for (const cityId of new Set(rows.map((r) => r.event.cityId))) xpByCity.set(cityId, await getSetting(db, 'posterShareXp', { cityId }));
  return {
    proofs: rows.map((r) => ({
      ...toProofInfo(r),
      member: r.member,
      event: { id: r.event.id, title: r.event.title, city: r.event.city.name, startsAt: r.event.startsAt.toISOString() },
      reviewedBy: r.reviewedBy?.name ?? null,
      rewardXp: xpByCity.get(r.event.cityId) ?? 0,
    })),
  };
}

export async function decideProof(admin: AuthUser, id: string, raw: unknown) {
  if (!can(admin.role, 'promoter.manage')) throw new AppError('FORBIDDEN', 403);
  const input = posterProofDecisionSchema.parse(raw);
  const result = await atomic(async (tx) => {
    const proof = await tx.posterProof.findUnique({ where: { id }, include: { event: true, member: { include: { user: true } } } });
    if (!proof) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, proof.event.cityId);
    const xp = input.decision === 'APPROVED' ? await getSetting(tx, 'posterShareXp', { cityId: proof.event.cityId }) : 0;
    const claimed = await tx.posterProof.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: input.decision,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectReason: input.decision === 'REJECTED' ? input.reason : null,
        xpAwarded: input.decision === 'APPROVED' ? xp : null,
      },
    });
    if (!claimed.count) throw new AppError('REQUEST_DECIDED', 409);
    if (input.decision === 'APPROVED' && xp > 0) {
      await creditXp(tx, { memberId: proof.memberId, delta: xp, reason: 'POSTER_SHARE', refType: 'PosterProof', refId: proof.id, awardKey: `poster:${proof.id}` });
    }
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'poster.proof.decided', targetType: 'PosterProof', targetId: proof.id, meta: { decision: input.decision, reason: input.reason, xp, eventId: proof.eventId } } });
    return { memberId: proof.memberId, userId: proof.member.userId, locale: proof.member.user.locale, event: proof.event, xp };
  });
  await publish({ kind: 'wallet', id: result.memberId });
  await notifyUsers([result.userId], {
    kind: 'posterProofDecided',
    values: {
      event: result.event.title,
      status: (locale) => {
        const t = createTranslator(locale);
        return input.decision === 'APPROVED' ? t('ux.posterProof.statusAPPROVED', { xp: result.xp }) : t('ux.posterProof.statusREJECTED', { reason: input.reason });
      },
    },
    data: { screen: 'event', eventId: result.event.id, proofId: id },
  });
  const row = await db.posterProof.findUniqueOrThrow({ where: { id } });
  return toProofInfo(row);
}

/** The screenshot: its owner, crew of the event city, HQ. */
export async function proofImage(user: AuthUser, id: string) {
  const proof = await db.posterProof.findUnique({ where: { id }, include: { event: { select: { cityId: true } }, member: { select: { userId: true } } } });
  if (!proof) throw new AppError('NOT_FOUND', 404);
  if (proof.member.userId !== user.id) {
    if (!can(user.role, 'promoter.manage')) throw new AppError('FORBIDDEN', 403);
    requireCityAccess(user, proof.event.cityId);
  }
  const file = await storage().get(proof.imageKey);
  if (!file) throw new AppError('NOT_FOUND', 404);
  return file;
}
