import 'server-only';
import { promoterBonus, promoterInput, reviewInput } from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { getSetting } from '../settings';
import { atomic } from './transaction';
import { receiptStorage } from './storage/receipts';

export async function setPromoter(
  admin: AuthUser,
  memberId: string,
  enabled: boolean,
) {
  return atomic(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: memberId } });
    if (!member) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, member.cityId);
    await tx.member.update({
      where: { id: memberId },
      data: { isPromoter: enabled, promoterSince: enabled ? new Date() : null },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'promoter.flag',
        targetType: 'Member',
        targetId: memberId,
        meta: { enabled },
      },
    });
  });
}

export async function submitReport(memberId: string, raw: unknown) {
  const input = promoterInput.parse(raw);
  if (!input.receiptUrl.startsWith(`receipts/${memberId}/`))
    throw new AppError('FORBIDDEN', 403);
  await receiptStorage.getSignedUrl(input.receiptUrl, {
    operation: 'read',
    expiresInSeconds: 1,
  });
  return atomic(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: memberId } });
    if (!member?.isPromoter || member.status !== 'ACTIVE')
      throw new AppError('FORBIDDEN', 403);
    const event = await tx.event.findUnique({ where: { id: input.eventId } });
    if (!event || event.status === 'DRAFT' || event.startsAt > new Date())
      throw new AppError('NOT_FOUND', 404);
    if (
      member.cityId !== event.cityId &&
      !(await tx.checkIn.findUnique({
        where: { eventId_memberId: { eventId: event.id, memberId } },
      }))
    )
      throw new AppError('FORBIDDEN', 403);
    const existing = await tx.promoterReport.findUnique({
      where: { memberId_eventId: { memberId, eventId: event.id } },
    });
    if (existing?.status === 'VALIDATED')
      throw new AppError('REPORT_REVIEWED', 409);
    const data = {
      ...input,
      cityId: event.cityId,
      memberId,
      guests: input.guests as Prisma.InputJsonValue,
      status: 'SUBMITTED' as const,
      bonusKind: null,
      bonusValue: null,
      reviewedAt: null,
      reviewedById: null,
      rejectReason: null,
    };
    const report = existing
      ? await tx.promoterReport.update({ where: { id: existing.id }, data })
      : await tx.promoterReport.create({ data });
    await tx.auditLog.create({
      data: {
        actorId: member.userId,
        action: existing ? 'promoter.resubmit' : 'promoter.submit',
        targetType: 'PromoterReport',
        targetId: report.id,
      },
    });
    return report;
  });
}

export async function reviewReport(
  admin: AuthUser,
  reportId: string,
  raw: unknown,
) {
  const input = reviewInput.parse(raw);
  return atomic(async (tx) => {
    const report = await tx.promoterReport.findUnique({
      where: { id: reportId },
      include: { payouts: true },
    });
    if (!report) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, report.cityId);
    if (input.action === 'cancel') {
      if (
        report.status !== 'VALIDATED' ||
        report.payouts.some((p) => p.status === 'PAID')
      )
        throw new AppError('REPORT_REVIEWED', 409);
      if (report.bonusKind === 'XP')
        await tx.xpLedger.create({
          data: {
            memberId: report.memberId,
            delta: -(report.bonusValue ?? 0),
            reason: 'ADJUST',
            refType: 'PromoterReportReversal',
            refId: report.id,
          },
        });
      // Pending payouts represent obligations; cancellation removes them before any money is paid.
      await tx.promoterPayout.deleteMany({
        where: { promoterReportId: report.id, status: 'PENDING' },
      });
    } else if (report.status !== 'SUBMITTED')
      throw new AppError('REPORT_REVIEWED', 409);
    let bonusKind: 'XP' | 'CASH' | null = null;
    let bonusValue: number | null = null;
    if (input.action === 'validate') {
      bonusKind = (await getSetting(tx, 'promoterBonusKind')) as 'XP' | 'CASH';
      if (bonusKind === 'CASH' && report.receiptAmount === null)
        throw new AppError('VALIDATION', 422);
      bonusValue = promoterBonus(
        bonusKind,
        report.guestCount,
        await getSetting(tx, 'promoterBonusPerGuestXp', {
          cityId: report.cityId,
        }),
        report.receiptAmount ?? 0,
        await getSetting(tx, 'promoterCommissionPercent', {
          cityId: report.cityId,
        }),
      );
      if (bonusValue > 2_000_000_000) throw new AppError('VALIDATION', 422);
      if (bonusKind === 'XP')
        await tx.xpLedger.create({
          data: {
            memberId: report.memberId,
            delta: bonusValue,
            reason: 'PROMOTER_BONUS',
            refType: 'PromoterReport',
            refId: report.id,
          },
        });
      else
        await tx.promoterPayout.create({
          data: {
            memberId: report.memberId,
            promoterReportId: report.id,
            amount: bonusValue,
          },
        });
    }
    const updated = await tx.promoterReport.update({
      where: { id: report.id },
      data: {
        status: input.action === 'validate' ? 'VALIDATED' : 'REJECTED',
        bonusKind,
        bonusValue,
        reviewedAt: new Date(),
        reviewedById: admin.id,
        rejectReason: input.action === 'validate' ? null : input.reason,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: `promoter.${input.action}`,
        targetType: 'PromoterReport',
        targetId: report.id,
        meta: { bonusKind, bonusValue, reason: input.reason },
      },
    });
    return updated;
  });
}

export async function memberReports(memberId: string) {
  const member = await db.member.findUnique({ where: { id: memberId } });
  if (!member?.isPromoter) throw new AppError('FORBIDDEN', 403);
  const [reports, events] = await Promise.all([
    db.promoterReport.findMany({
      where: { memberId },
      include: {
        member: { select: { fullName: true } },
        event: { select: { title: true } },
        payouts: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.event.findMany({
      where: {
        status: { not: 'DRAFT' },
        startsAt: { lte: new Date() },
        OR: [{ cityId: member.cityId }, { checkIns: { some: { memberId } } }],
      },
      select: { id: true, title: true },
      orderBy: { startsAt: 'desc' },
    }),
  ]);
  return { reports, events };
}
