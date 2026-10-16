import 'server-only';
import { can, claimInput, claimReviewInput, createTranslator, prBonusXp } from '@pats/shared';
import { db } from '../db';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { AppError } from '../http/errors';
import { getSetting } from '../settings';
import { publish } from '../social/realtime';
import { deliverStoredNotification } from '../push/notify';
import { atomic } from './transaction';
import { assertReceiptExists } from './receipts';
import { creditXp } from './xp';

export async function memberClaims(memberId: string) {
  const member = await db.member.findUniqueOrThrow({ where: { id: memberId } });
  return {
    claims: await db.xpClaim.findMany({ where: { memberId }, include: { member: { select: { fullName: true } }, event: { select: { title: true } } }, orderBy: { createdAt: 'desc' } }),
    events: await db.event.findMany({ where: { status: { not: 'DRAFT' }, endsAt: { lte: new Date() },
      OR: [{ cityId: member.cityId }, { checkIns: { some: { memberId } } }] }, select: { id: true, title: true }, orderBy: { endsAt: 'desc' } }),
    isPromoter: member.isPromoter, allowMemberGl: Boolean(await getSetting(db, 'memberClaimAllowGl')),
  };
}

export async function saveClaim(memberId: string, raw: unknown, claimId?: string) {
  const input = claimInput.parse(raw);
  if (input.receiptUrl) {
    if (!input.receiptUrl.startsWith(`receipts/${memberId}/`)) throw new AppError('FORBIDDEN', 403);
    await assertReceiptExists(input.receiptUrl);
  }
  return atomic(async tx => {
    const member = await tx.member.findUnique({ where: { id: memberId }, include: { user: true } });
    if (!member || member.status !== 'ACTIVE' || member.user.status !== 'ACTIVE' || (input.formType === 'PR' && !member.isPromoter)) throw new AppError('FORBIDDEN', 403);
    if (input.formType === 'MEMBER' && input.guestCount && !await getSetting(tx, 'memberClaimAllowGl')) throw new AppError('VALIDATION', 422);
    const event = await tx.event.findUnique({ where: { id: input.eventId } });
    if (!event || event.status === 'DRAFT' || event.endsAt > new Date()) throw new AppError('CLAIM_NOT_OPEN', 409);
    if (event.cityId !== member.cityId && !await tx.checkIn.findUnique({ where: { eventId_memberId: { eventId: event.id, memberId } } })) throw new AppError('FORBIDDEN', 403);
    const existing = await tx.xpClaim.findUnique({ where: { memberId_eventId_formType: { memberId, eventId: input.eventId, formType: input.formType } } });
    if (!claimId && existing) throw new AppError('CLAIM_EXISTS', 409);
    if (claimId && (!existing || existing.id !== claimId || existing.status !== 'PENDING')) throw new AppError('REQUEST_DECIDED', 409);
    const claim = claimId
      ? await tx.xpClaim.update({ where: { id: claimId, status: 'PENDING' }, data: input })
      : await tx.xpClaim.create({ data: { ...input, memberId } });
    await tx.auditLog.create({ data: { actorId: member.userId, action: claimId ? 'claim.edit' : 'claim.submit', targetType: 'XpClaim', targetId: claim.id,
      meta: { before: existing ? { guestCount: existing.guestCount, reservationCount: existing.reservationCount } : null,
        after: { guestCount: input.guestCount, reservationCount: input.reservationCount }, formType: input.formType } } });
    return claim;
  });
}

export async function crewClaims(admin: AuthUser) {
  if (!can(admin.role, 'promoter.manage')) throw new AppError('FORBIDDEN', 403);
  return { claims: await db.xpClaim.findMany({ where: { event: { cityId: can(admin.role, 'hq.manage') ? undefined : admin.cityId! } },
    include: { member: { select: { fullName: true } }, event: { select: { title: true } } }, orderBy: [{ reviewedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }] }) };
}

export async function reviewClaim(admin: AuthUser, raw: unknown) {
  if (!can(admin.role, 'promoter.manage')) throw new AppError('FORBIDDEN', 403);
  const input = claimReviewInput.parse(raw);
  const result = await atomic(async tx => {
    const claim = await tx.xpClaim.findUnique({ where: { id: input.id }, include: { event: true, member: { include: { user: true } } } });
    if (!claim) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, claim.event.cityId);
    if (claim.status !== 'PENDING') throw new AppError('REQUEST_DECIDED', 409);
    const guestCount = input.guestCount ?? claim.guestCount;
    const reservationCount = input.reservationCount ?? claim.reservationCount;
    if (input.decision === 'APPROVED' && claim.formType === 'MEMBER' && guestCount && !await getSetting(tx, 'memberClaimAllowGl')) throw new AppError('VALIDATION', 422);
    const pr = claim.formType === 'PR';
    const bonus = input.decision === 'APPROVED' ? prBonusXp(guestCount, reservationCount,
      await getSetting(tx, pr ? 'promoterBonusPerGuestXp' : 'memberBonusPerGuestXp', { cityId: claim.event.cityId }),
      await getSetting(tx, pr ? 'promoterBonusPerReservationXp' : 'memberBonusPerReservationXp', { cityId: claim.event.cityId })) : 0;
    if (bonus > 2_000_000_000) throw new AppError('VALIDATION', 422);
    const changed = await tx.xpClaim.updateMany({ where: { id: claim.id, status: 'PENDING' }, data: {
      status: input.decision, guestCount, reservationCount, bonusValue: bonus, reviewedById: admin.id,
      reviewedAt: new Date(), rejectReason: input.decision === 'REJECTED' ? input.reason : null,
    } });
    if (!changed.count) throw new AppError('REQUEST_DECIDED', 409);
    if (input.decision === 'APPROVED') await creditXp(tx, { memberId: claim.memberId, delta: bonus,
      reason: pr ? 'PROMOTER_BONUS' : 'MEMBER_CLAIM', refType: 'XpClaim', refId: claim.id, awardKey: `claim:${claim.id}` });
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'claim.decide', targetType: 'XpClaim', targetId: claim.id,
      meta: { decision: input.decision, reason: input.reason, bonus, formType: claim.formType,
        before: { guestCount: claim.guestCount, reservationCount: claim.reservationCount }, after: { guestCount, reservationCount } } } });
    const t = createTranslator(claim.member.user.locale);
    const notificationId = `claim:${claim.id}`;
    await tx.notification.create({ data: { id: notificationId, userId: claim.member.userId, kind: 'claimDecided',
      title: t('phase5.claimTitle'), body: input.decision === 'APPROVED'
        ? t('phase5.claimApproved', { event: claim.event.title, xp: bonus })
        : t('phase5.claimRejected', { event: claim.event.title, reason: input.reason }),
      data: { screen: 'claims' },
    } });
    return { memberId: claim.memberId, notificationId, bonus };
  });
  await publish({ kind: 'wallet', id: result.memberId });
  await deliverStoredNotification(result.notificationId);
  return { bonus: result.bonus };
}
