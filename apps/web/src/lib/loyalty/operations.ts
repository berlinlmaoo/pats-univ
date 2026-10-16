import { can } from '@pats/shared';
import 'server-only';
import { recapInput } from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { atomic } from './transaction';

export function cityScope(admin: AuthUser, cityId?: string) {
  if (can(admin.role, 'hq.manage')) return cityId;
  if (!can(admin.role, 'city.operations') || !admin.cityId)
    throw new AppError('FORBIDDEN', 403);
  if (cityId) requireCityAccess(admin, cityId);
  return admin.cityId;
}
export async function operations(
  admin: AuthUser,
  filters: { cityId?: string; from?: Date; to?: Date } = {},
) {
  const cityId = cityScope(admin, filters.cityId);
  const eventWhere: Prisma.EventWhereInput = {
    cityId,
    ...(filters.from || filters.to
      ? { startsAt: { gte: filters.from, lt: filters.to } }
      : {}),
  };
  const [events, reports, members, checkIns, fulfilled] = await Promise.all([
    db.event.findMany({
      where: eventWhere,
      include: { city: { select: { name: true } }, recap: true },
      orderBy: { startsAt: 'desc' },
    }),
    db.promoterReport.findMany({
      where: { cityId, event: eventWhere },
      include: {
        member: { select: { fullName: true } },
        event: {
          select: { title: true, _count: { select: { checkIns: true } } },
        },
        payouts: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.member.findMany({
      where: { cityId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      select: { id: true, fullName: true, nim: true, isPromoter: true },
      orderBy: { fullName: 'asc' },
    }),
    db.checkIn.count({ where: { event: eventWhere } }),
    db.redemption.count({ where: { status: 'FULFILLED', event: eventWhere } }),
  ]);
  return {
    canLockRecap: can(admin.role, 'hq.manage'),
    events,
    reports,
    members,
    stats: {
      members: members.length,
      checkIns,
      fulfilled,
      revenue: events.reduce((s, e) => s + (e.recap?.total ?? 0), 0),
    },
  };
}

export async function saveRecap(admin: AuthUser, raw: unknown) {
  const input = recapInput.parse(raw);
  return atomic(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: { recap: true },
    });
    if (!event) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, event.cityId);
    if (event.recap?.lockedAt) throw new AppError('RECAP_LOCKED', 409);
    const data = {
      ...input,
      cityId: event.cityId,
      submittedById: admin.id,
      total: input.revenueSofa + input.revenueTable + input.revenueFdc,
    };
    const recap = await tx.trafficRecap.upsert({
      where: { eventId: event.id },
      create: data,
      update: data,
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'recap.save',
        targetType: 'TrafficRecap',
        targetId: recap.id,
      },
    });
    return recap;
  });
}
export async function lockRecap(admin: AuthUser, eventId: string) {
  if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  return atomic(async (tx) => {
    const row = await tx.trafficRecap.findUnique({ where: { eventId } });
    if (!row) throw new AppError('NOT_FOUND', 404);
    const recap = await tx.trafficRecap.update({
      where: { id: row.id },
      data: { lockedAt: row.lockedAt ?? new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'recap.lock',
        targetType: 'TrafficRecap',
        targetId: recap.id,
      },
    });
    return recap;
  });
}
