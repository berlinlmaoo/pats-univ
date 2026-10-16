import 'server-only';
import { can } from '@pats/shared';
import { z } from 'zod';
import { requireCityAccess, type AuthUser } from './auth/current-user';
import { AppError } from './http/errors';
import { atomic } from './loyalty/transaction';
import { getSetting } from './settings';

export async function requestRegionChange(memberId: string, raw: unknown) {
  const input = z.object({ cityId: z.string(), reason: z.string().trim().min(3).max(1000) }).parse(raw);
  return atomic(async tx => {
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${memberId} FOR UPDATE`;
    const member = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
    if (member.cityId === input.cityId || !await tx.city.findFirst({ where: { id: input.cityId, active: true } })) throw new AppError('VALIDATION', 422);
    if (await tx.regionChangeRequest.findFirst({ where: { memberId, status: 'PENDING' } })) throw new AppError('REQUEST_PENDING', 409);
    const row = await tx.regionChangeRequest.create({ data: { memberId, fromCityId: member.cityId, toCityId: input.cityId, reason: input.reason } });
    await tx.auditLog.create({ data: { actorId: member.userId, action: 'region.request', targetType: 'RegionChangeRequest', targetId: row.id, meta: input } });
    return row;
  });
}
export async function decideRegionChange(admin: AuthUser, raw: unknown) {
  if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  const input = z.object({ id: z.string(), decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(1000).default('') }).parse(raw);
  return atomic(async tx => {
    const request = await tx.regionChangeRequest.findUnique({ where: { id: input.id } });
    if (!request) throw new AppError('NOT_FOUND', 404);
    const claimed = await tx.regionChangeRequest.updateMany({ where: { id: input.id, status: 'PENDING' },
      data: { status: input.decision, decisionNote: input.note, decidedAt: new Date(), decidedById: admin.id } });
    if (!claimed.count) throw new AppError('REQUEST_DECIDED', 409);
    if (input.decision === 'APPROVED') {
      if (!await tx.city.findFirst({ where: { id: request.toCityId, active: true } })) throw new AppError('CITY_NOT_FOUND', 422);
      await tx.member.update({ where: { id: request.memberId }, data: { cityId: request.toCityId } });
    }
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'region.decide', targetType: 'RegionChangeRequest', targetId: request.id, meta: input } });
  });
}

export async function recordDownPayment(admin: AuthUser, raw: unknown) {
  if (!can(admin.role, 'reservation.manage')) throw new AppError('FORBIDDEN', 403);
  const input = z.object({ id: z.string(), amount: z.number().int().min(1).max(2_000_000_000) }).parse(raw);
  return atomic(async tx => {
    const r = await tx.reservation.findUnique({ where: { id: input.id }, include: { event: true } });
    if (!r) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, r.event.cityId);
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${r.memberId} FOR UPDATE`;
    if (r.status !== 'CONFIRMED') throw new AppError('VALIDATION', 422);
    const claimed = await tx.reservation.updateMany({ where: { id: r.id, downPaymentAt: null, status: 'CONFIRMED' },
      data: { downPaymentAmount: input.amount, downPaymentAt: new Date(), downPaymentById: admin.id } });
    if (!claimed.count) throw new AppError('REQUEST_DECIDED', 409);
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'reservation.downPayment', targetType: 'Reservation', targetId: r.id, meta: { amount: input.amount } } });
  });
}
export async function recordCardFee(admin: AuthUser, cardId: string) {
  if (!can(admin.role, 'card.reportLost')) throw new AppError('FORBIDDEN', 403);
  return atomic(async tx => {
    const card = await tx.card.findUnique({ where: { id: cardId }, include: { member: true } });
    if (!card) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, card.member.cityId);
    if (card.replacementFee === null) throw new AppError('VALIDATION', 422);
    const claimed = await tx.card.updateMany({ where: { id: card.id, feePaidAt: null }, data: { feePaidAt: new Date(), feeRecordedById: admin.id } });
    if (!claimed.count) throw new AppError('REQUEST_DECIDED', 409);
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'card.feePaid', targetType: 'Card', targetId: card.id, meta: { amount: card.replacementFee } } });
  });
}

export async function createRegionalAdmin(admin: AuthUser, input: { name: string; email: string; phone: string; cityId: string; locale: 'id' | 'en' }) {
  if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  return atomic(async tx => {
    await tx.$queryRaw`SELECT id FROM "City" WHERE id = ${input.cityId} FOR UPDATE`;
    const count = await tx.user.count({ where: { role: 'REGIONAL_ADMIN', cityId: input.cityId, status: 'ACTIVE' } });
    if (count >= await getSetting(tx, 'regionalAdminLimit', { cityId: input.cityId })) throw new AppError('ADMIN_LIMIT', 409);
    const user = await tx.user.create({ data: { ...input, role: 'REGIONAL_ADMIN' } });
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'admin.created', targetType: 'User', targetId: user.id, meta: { cityId: input.cityId } } });
    return user;
  });
}
export async function setRegionalAdminActive(admin: AuthUser, userId: string, active: boolean) {
  if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  return atomic(async tx => {
    const user = await tx.user.findFirst({ where: { id: userId, role: 'REGIONAL_ADMIN' } });
    if (!user?.cityId) throw new AppError('NOT_FOUND', 404);
    await tx.$queryRaw`SELECT id FROM "City" WHERE id = ${user.cityId} FOR UPDATE`;
    if (active && user.status !== 'ACTIVE') {
      const count = await tx.user.count({ where: { role: 'REGIONAL_ADMIN', cityId: user.cityId, status: 'ACTIVE' } });
      if (count >= await getSetting(tx, 'regionalAdminLimit', { cityId: user.cityId })) throw new AppError('ADMIN_LIMIT', 409);
    }
    await tx.user.update({ where: { id: userId }, data: { status: active ? 'ACTIVE' : 'DISABLED' } });
    if (!active) await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: admin.id, action: active ? 'admin.reactivated' : 'admin.deactivated', targetType: 'User', targetId: userId } });
  });
}

/** Preserve attendance and financial records while removing the departing member's profile data. */
export async function anonymizeMember(memberId: string) {
  return atomic(async tx => {
    const member = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
    await tx.member.update({ where: { id: memberId }, data: {
      status: 'INACTIVE', fullName: 'Former member', dateOfBirth: new Date('1970-01-01'),
      favoriteSong: '', favoriteGenre: '', quotes: '', photoUrl: null, isPromoter: false, signupSource: null,
    } });
    await tx.user.update({ where: { id: member.userId }, data: {
      status: 'DISABLED', name: 'Former member', email: `deleted-${member.id}@pats.invalid`, phone: '',
    } });
    await tx.session.updateMany({ where: { userId: member.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.device.deleteMany({ where: { userId: member.userId } });
    await tx.promoterReport.updateMany({ where: { memberId }, data: { guests: [], receiptUrl: '', notes: null } });
    await tx.xpClaim.updateMany({ where: { memberId }, data: { receiptUrl: '', notes: '' } });
    await tx.auditLog.create({ data: { actorId: member.userId, action: 'member.anonymized', targetType: 'Member', targetId: memberId } });
  });
}
