import 'server-only';
import { randomInt } from 'node:crypto';
import { addMonths, can, leaderboardWindow, rankMembers } from '@pats/shared';
import { z } from 'zod';
import { db } from '../db';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { cityAccess } from '../social/access';
import { publish } from '../social/realtime';
import { AppError } from '../http/errors';
import { getSetting } from '../settings';
import { atomic } from './transaction';
import { balance } from './rewards';
import { xpLots } from './xp';

/** Close each city's last quarter once. The unique city/period key is the award lock. */
export async function grantQuarterWinners(now = new Date()) {
  const current = leaderboardWindow('QUARTERLY', now)!;
  const period = leaderboardWindow('QUARTERLY', new Date(current.start.getTime() - 1))!;
  const cities = await db.city.findMany({ where: { active: true } });
  for (const city of cities) await atomic(async tx => {
    const existing = await tx.freeDrawCredit.findUnique({
      where: { cityId_periodStart: { cityId: city.id, periodStart: period.start } },
    });
    if (existing) return;
    const totals = await tx.xpLedger.groupBy({
      by: ['memberId'], where: {
        delta: { gt: 0 }, reason: { not: 'REFUND' }, createdAt: { gte: period.start, lt: period.end },
        member: { cityId: city.id, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      }, _sum: { delta: true }, _max: { createdAt: true },
    });
    const members = await tx.member.findMany({ where: { id: { in: totals.map(t => t.memberId) } } });
    const ranked = rankMembers(totals.map(t => {
      const m = members.find(m => m.id === t.memberId)!;
      return { memberId: m.id, name: m.fullName, nim: m.nim, city: city.name, photoUrl: m.photoUrl,
        xp: t._sum.delta ?? 0, reachedAt: t._max.createdAt!.toISOString() };
    }));
    if (!ranked.length) return;
    const expiresAt = addMonths(period.end, await getSetting(tx, 'freeDrawExpiryMonths'));
    const event = await tx.event.findFirst({
      where: { cityId: city.id, status: { not: 'DRAFT' }, startsAt: { gte: period.end, lt: expiresAt } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    const credit = await tx.freeDrawCredit.create({ data: {
      cityId: city.id, memberId: ranked[0]!.memberId, periodStart: period.start, periodEnd: period.end,
      expiresAt, eventId: event?.id,
    } });
    await tx.auditLog.create({ data: { action: 'draw.quarterAward', targetType: 'FreeDrawCredit',
      targetId: credit.id, meta: { cityId: city.id, winner: ranked[0]!.memberId, xp: ranked[0]!.xp } } });
  });
  // A city may have published its next event after the quarter closed.
  for (const credit of await db.freeDrawCredit.findMany({ where: { eventId: null, usedAt: null, expiresAt: { gt: now } } })) {
    const event = await db.event.findFirst({ where: { cityId: credit.cityId, status: { not: 'DRAFT' },
      startsAt: { gte: credit.periodEnd, lt: credit.expiresAt } }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] });
    if (event) await db.freeDrawCredit.updateMany({ where: { id: credit.id, eventId: null }, data: { eventId: event.id } });
  }
}

export async function drawState(user: AuthUser, eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, include: {
    drawEntries: { orderBy: { position: 'asc' }, include: { member: { select: { fullName: true } } } },
  } });
  if (!event || (event.status === 'DRAFT' && !can(user.role, 'draw.manage'))) throw new AppError('NOT_FOUND', 404);
  await cityAccess(user, event.cityId);
  const member = await db.member.findUnique({ where: { userId: user.id } });
  const credit = member ? await db.freeDrawCredit.findFirst({ where: {
    memberId: member.id, eventId, usedAt: null, expiresAt: { gt: new Date() },
  } }) : null;
  return {
    eventId, prize: event.drawPrize, peakStartsAt: event.peakStartsAt, peakEndsAt: event.peakEndsAt,
    capacity: event.drawSlots ?? await getSetting(db, 'drawSlots', { eventId }),
    costXp: await getSetting(db, 'spinCostXp'), startedAt: event.drawStartedAt,
    winnerEntryId: event.drawWinnerEntryId,
    entries: event.drawEntries.map(e => ({ id: e.id, position: e.position, name: e.member.fullName, memberId: e.memberId })),
    ownEntryId: event.drawEntries.find(e => e.memberId === member?.id)?.id ?? null,
    freeCredit: credit ? { id: credit.id, expiresAt: credit.expiresAt } : null,
  };
}

export async function takeDrawSlot(memberId: string, eventId: string) {
  await grantQuarterWinners();
  const entry = await atomic(async tx => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    const event = await tx.event.findUnique({ where: { id: eventId } });
    const now = new Date();
    if (!event || event.status !== 'OPEN' || !event.drawPrize || !event.peakStartsAt || !event.peakEndsAt ||
      now < event.peakStartsAt || now >= event.peakEndsAt || event.drawStartedAt)
      throw new AppError('EVENT_NOT_OPEN', 409);
    const member = await tx.member.findUnique({ where: { id: memberId }, include: { user: true } });
    if (!member || member.status !== 'ACTIVE' || member.user.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 403);
    if (!await tx.checkIn.findUnique({ where: { eventId_memberId: { eventId, memberId } } }))
      throw new AppError('CHECK_IN_REQUIRED', 409);
    const used = await tx.drawEntry.findUnique({ where: { eventId_memberId: { eventId, memberId } } });
    const limit = await getSetting(tx, 'maxSpinsPerEvent', { eventId });
    if (used || limit < 1) throw new AppError('SPIN_LIMIT', 409);
    const count = await tx.drawEntry.count({ where: { eventId } });
    const capacity = event.drawSlots ?? await getSetting(tx, 'drawSlots', { eventId });
    if (count >= capacity) throw new AppError('DRAW_FULL', 409);
    const credit = await tx.freeDrawCredit.findFirst({ where: { memberId, cityId: event.cityId, eventId,
      usedAt: null, expiresAt: { gt: now } } });
    const cost = credit ? 0 : await getSetting(tx, 'spinCostXp');
    if (await balance(tx, memberId) < cost) throw new AppError('INSUFFICIENT_XP', 409);
    if (credit) {
      const claimed = await tx.freeDrawCredit.updateMany({ where: { id: credit.id, usedAt: null }, data: { usedAt: now } });
      if (!claimed.count) throw new AppError('SPIN_LIMIT', 409);
    }
    const row = await tx.drawEntry.create({ data: { eventId, memberId, position: count + 1, xpSpent: cost, freeCreditId: credit?.id } });
    if (cost) await tx.xpLedger.create({ data: { memberId, delta: -cost, reason: 'SPIN',
      refType: 'DrawEntry', refId: row.id, awardKey: `draw:${row.id}`,
      expiresAt: (await xpLots(tx, memberId))[0]?.expiresAt } });
    await tx.auditLog.create({ data: { actorId: member.userId, action: 'draw.enter', targetType: 'DrawEntry', targetId: row.id,
      meta: { eventId, cost, freeCreditId: credit?.id ?? null } } });
    return row;
  });
  await publish({ kind: 'draw', id: eventId });
  return entry;
}

export async function runDraw(admin: AuthUser, eventId: string) {
  if (!can(admin.role, 'draw.manage')) throw new AppError('FORBIDDEN', 403);
  const result = await atomic(async tx => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    const event = await tx.event.findUnique({ where: { id: eventId }, include: {
      drawEntries: { orderBy: { position: 'asc' }, include: { member: { select: { fullName: true } } } },
    } });
    if (!event) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, event.cityId);
    if (event.drawStartedAt) throw new AppError('DRAW_COMPLETED', 409);
    if (event.status !== 'OPEN' || event.startsAt > new Date() || event.endsAt <= new Date()) throw new AppError('EVENT_NOT_OPEN', 409);
    const capacity = event.drawSlots ?? await getSetting(tx, 'drawSlots', { eventId });
    if (!event.drawPrize || event.drawEntries.length !== capacity) throw new AppError('DRAW_NOT_READY', 409);
    const winner = event.drawEntries[randomInt(event.drawEntries.length)]!;
    const startedAt = new Date();
    await tx.event.update({ where: { id: eventId }, data: {
      drawStartedAt: startedAt, drawStartedById: admin.id, drawWinnerEntryId: winner.id,
    } });
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'draw.run', targetType: 'Event', targetId: eventId,
      meta: { startedAt: startedAt.toISOString(), prize: event.drawPrize, winnerEntryId: winner.id,
        entrants: event.drawEntries.map(e => ({ id: e.id, memberId: e.memberId, name: e.member.fullName, position: e.position })) } } });
    return { winnerEntryId: winner.id, startedAt };
  });
  await publish({ kind: 'draw', id: eventId });
  return result;
}

export async function configureDraw(admin: AuthUser, raw: unknown) {
  if (!can(admin.role, 'draw.manage')) throw new AppError('FORBIDDEN', 403);
  const input = z.object({ eventId: z.string(), prize: z.string().trim().min(1).max(200),
    peakStartsAt: z.iso.datetime({ offset: true }), peakEndsAt: z.iso.datetime({ offset: true }),
    capacity: z.number().int().min(1).max(100).nullable().default(null) }).parse(raw);
  const start = new Date(input.peakStartsAt), end = new Date(input.peakEndsAt);
  return atomic(async tx => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${input.eventId} FOR UPDATE`;
    const event = await tx.event.findUnique({ where: { id: input.eventId }, include: { _count: { select: { drawEntries: true } } } });
    if (!event) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, event.cityId);
    if (event.drawStartedAt || event._count.drawEntries) throw new AppError('REQUEST_DECIDED', 409);
    if (end <= start || start < event.startsAt || end > event.endsAt) throw new AppError('VALIDATION', 422);
    await tx.event.update({ where: { id: event.id }, data: {
      drawPrize: input.prize, peakStartsAt: start, peakEndsAt: end, drawSlots: input.capacity,
    } });
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'draw.configure', targetType: 'Event', targetId: event.id, meta: input } });
  });
}

export async function assignFreeCredit(admin: AuthUser, creditId: string, eventId: string) {
  if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  return atomic(async tx => {
    const credit = await tx.freeDrawCredit.findUnique({ where: { id: creditId } });
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!credit || !event) throw new AppError('NOT_FOUND', 404);
    if (credit.usedAt || event.drawStartedAt || event.cityId !== credit.cityId || event.status === 'DRAFT' ||
      event.startsAt < credit.periodEnd || event.startsAt >= credit.expiresAt || event.endsAt <= new Date())
      throw new AppError('VALIDATION', 422);
    await tx.freeDrawCredit.update({ where: { id: credit.id }, data: { eventId } });
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'draw.assignCredit', targetType: 'FreeDrawCredit', targetId: creditId, meta: { eventId } } });
  });
}
