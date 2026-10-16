import 'server-only';
import { randomInt } from 'node:crypto';
import {
  isRedeemExpired,
  redeemExpiry,
  rewardInput,
  can,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { getSetting } from '../settings';
import { expireXp, xpLots, spendingSlices } from './xp';
import { atomic } from './transaction';

type Tx = Prisma.TransactionClient;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () =>
  Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(
    '',
  );

export async function balance(tx: Tx, memberId: string) {
  await expireXp(tx, memberId);
  return (
    (
      await tx.xpLedger.aggregate({
        where: { memberId },
        _sum: { delta: true },
      })
    )._sum.delta ?? 0
  );
}

/** Refund the exact original debit, even if prices have since changed. Status is the idempotency guard. */
export async function expireInTransaction(
  tx: Tx,
  memberId?: string,
  now = new Date(),
) {
  const rows = await tx.redemption.findMany({
    where: { memberId, status: 'ISSUED', expiresAt: { lte: now } },
  });
  for (const row of rows) {
    const claimed = await tx.redemption.updateMany({
      where: { id: row.id, status: 'ISSUED' },
      data: { status: 'EXPIRED' },
    });
    if (!claimed.count) continue;
    const debit = await tx.xpLedger.findFirst({
      where: {
        memberId: row.memberId,
        refType: 'Redemption',
        refId: row.id,
        reason: { in: ['REDEEM', 'SPIN'] },
      },
    });
    if (debit) {
      const slices = Array.isArray(debit.allocations) && debit.allocations.length
        ? debit.allocations as { amount: number; expiresAt: string | null }[]
        : await spendingSlices(tx, row.memberId, -debit.delta, debit);
      for (const [i, slice] of slices.entries()) await tx.xpLedger.create({ data: {
        memberId: row.memberId, delta: slice.amount, reason: 'REFUND', expiresAt: slice.expiresAt ? new Date(slice.expiresAt) : null,
        awardKey: `refund:${row.id}:${i}`, refType: 'Redemption', refId: row.id,
      } });
    }
    await tx.reward.updateMany({
      where: { id: row.rewardId, stock: { not: null } },
      data: { stock: { increment: 1 } },
    });
  }
  return rows.length;
}
export const expireRedemptions = (memberId?: string) =>
  atomic((tx) => expireInTransaction(tx, memberId));

async function eligibleEvent(
  tx: Tx,
  memberId: string,
  eventId: string,
  now: Date,
) {
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  if (
    event.status !== 'OPEN' ||
    now < event.checkInOpensAt ||
    now >= event.checkInClosesAt
  )
    throw new AppError('EVENT_NOT_OPEN', 409);
  const attendance = await tx.checkIn.findUnique({
    where: { eventId_memberId: { eventId, memberId } },
  });
  if (!attendance) throw new AppError('CHECK_IN_REQUIRED', 409);
  return event;
}

export async function issueReward(
  memberId: string,
  input: { eventId: string; rewardId?: string },
  spin: boolean,
) {
  return atomic(async (tx) => {
    const now = new Date();
    await expireInTransaction(tx, memberId, now);
    const event = await eligibleEvent(tx, memberId, input.eventId, now);
    if (spin) throw new AppError('FORBIDDEN', 403);
    const reward = await tx.reward.findFirst({ where: {
      id: input.rewardId, active: true, type: 'DIRECT', venueId: event.venueId ?? '__none__',
    } });
    const cost = reward?.xpCost ?? 0;
    if (!reward || (reward.stock !== null && reward.stock <= 0))
      throw new AppError('REWARD_UNAVAILABLE', 409);
    if ((await balance(tx, memberId)) < cost)
      throw new AppError('INSUFFICIENT_XP', 409);
    if (reward.stock !== null) {
      const reserved = await tx.reward.updateMany({
        where: { id: reward.id, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      });
      if (!reserved.count) throw new AppError('REWARD_UNAVAILABLE', 409);
    }
    const ttl = await getSetting(tx, 'redeemCodeTtlMinutes');
    const redemption = await tx.redemption.create({
      data: {
        memberId,
        eventId: event.id,
        rewardId: reward.id,
        code: newCode(),
        kind: spin ? 'SPIN' : 'DIRECT',
        issuedAt: now,
        expiresAt: redeemExpiry(now, ttl),
      },
      include: { reward: true },
    });
    await tx.xpLedger.create({
      data: {
        memberId,
        delta: -cost,
        allocations: await spendingSlices(tx, memberId, cost),
        expiresAt: (await xpLots(tx, memberId))[0]?.expiresAt,
        reason: spin ? 'SPIN' : 'REDEEM',
        refType: 'Redemption',
        refId: redemption.id,
      },
    });
    return { redemption, balance: await balance(tx, memberId) };
  });
}

export async function inspectCode(
  admin: AuthUser,
  code: string,
  eventId: string,
  fulfill = false,
) {
  const outcome = await atomic(async (tx) => {
    const row = await tx.redemption.findUnique({
      where: { code },
      include: {
        reward: true,
        member: { select: { fullName: true, nim: true } },
        event: true,
      },
    });
    if (!row || row.eventId !== eventId || !row.event)
      throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, row.event.cityId);
    if (row.status === 'EXPIRED') return { expired: true as const };
    if (row.status !== 'ISSUED') throw new AppError('REDEEM_USED', 409);
    if (isRedeemExpired(row.expiresAt, new Date())) {
      await expireInTransaction(tx, row.memberId);
      return { expired: true as const };
    }
    if (fulfill) {
      const claimed = await tx.redemption.updateMany({
        where: { id: row.id, status: 'ISSUED', expiresAt: { gt: new Date() } },
        data: {
          status: 'FULFILLED',
          fulfilledAt: new Date(),
          fulfilledByAdminId: admin.id,
        },
      });
      if (!claimed.count) throw new AppError('REDEEM_USED', 409);
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'reward.fulfill',
          targetType: 'Redemption',
          targetId: row.id,
        },
      });
    }
    return {
      expired: false as const,
      redemption: { ...row, status: fulfill ? 'FULFILLED' : row.status },
    };
  });
  // Throw after commit, otherwise the expiry refund would be rolled back.
  if (outcome.expired) throw new AppError('REDEEM_EXPIRED', 409);
  return outcome.redemption;
}

export async function wallet(memberId: string, cityId: string) {
  await expireRedemptions(memberId);
  const now = new Date();
  const current = await atomic(tx => balance(tx, memberId));
  const [
    ledger,
    rewards,
    redemptions,
    events,
    spinCostXp,
    maxSpinsPerEvent,
  ] = await Promise.all([
    db.xpLedger.findMany({
      where: { memberId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    }),
    db.reward.findMany({
      where: { active: true, type: 'DIRECT', venue: { cityId } },
      orderBy: [{ xpCost: 'asc' }, { name: 'asc' }],
    }),
    db.redemption.findMany({
      where: { memberId },
      include: { reward: true },
      orderBy: { issuedAt: 'desc' },
      take: 50,
    }),
    db.event.findMany({
      where: {
        status: 'OPEN',
        checkInOpensAt: { lte: now },
        checkInClosesAt: { gt: now },
        checkIns: { some: { memberId } },
      },
      select: {
        id: true,
        title: true,
        venueId: true,
        maxSpinsPerMember: true,
        redemptions: {
          where: { memberId, kind: 'SPIN' },
          select: { id: true },
        },
      },
      orderBy: { startsAt: 'desc' },
    }),
    getSetting(db, 'spinCostXp'),
    getSetting(db, 'maxSpinsPerEvent'),
  ]);
  const next =
    rewards.find(
      (r) =>
        r.type === 'DIRECT' &&
        (r.stock === null || r.stock > 0) &&
        r.xpCost > current,
    ) ??
    rewards.find(
      (r) => r.type === 'DIRECT' && (r.stock === null || r.stock > 0),
    );
  const profile = await db.member.findUnique({
    where: { id: memberId },
    select: { isPromoter: true },
  });
  return {
    balance: current,
    isPromoter: profile?.isPromoter ?? false,
    ledger,
    expiring: (await xpLots(db, memberId)).filter(l => l.expiresAt).map(l => ({ xp: l.remaining, expiresAt: l.expiresAt!.toISOString() })),
    rewards,
    redemptions,
    spinCostXp,
    maxSpinsPerEvent,
    milestone: next
      ? {
          reward: next,
          remaining: Math.max(0, next.xpCost - current),
          progress: next.xpCost
            ? Math.max(0, Math.min(1, current / next.xpCost))
            : 1,
        }
      : null,
    events: await Promise.all(
      events.map(async (e) => ({
        id: e.id,
        title: e.title,
        venueId: e.venueId,
        spinsUsed: e.redemptions.length,
        spinLimit:
          e.maxSpinsPerMember ??
          (await getSetting(db, 'maxSpinsPerEvent', { eventId: e.id })),
      })),
    ),
  };
}

export async function saveReward(admin: AuthUser, raw: unknown) {
  if (!can(admin.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  const { id, ...data } = rewardInput.parse(raw);
  return atomic(async (tx) => {
    const venue = await tx.venue.findUnique({ where: { id: data.venueId } });
    if (!venue) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, venue.cityId);
    if (id) {
      const old = await tx.reward.findUnique({ where: { id } });
      if (!old?.cityId) { if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403); }
      else requireCityAccess(admin, old.cityId);
    }
    data.cityId = venue.cityId;
    const reward = id
      ? await tx.reward.update({ where: { id }, data })
      : await tx.reward.create({ data });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'reward.save',
        targetType: 'Reward',
        targetId: reward.id,
      },
    });
    return reward;
  });
}
