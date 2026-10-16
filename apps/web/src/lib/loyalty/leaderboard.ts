import 'server-only';
import { leaderboardWindow, rankMembers, zonedParts } from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { db } from '../db';
import { AppError } from '../http/errors';
import { getSetting } from '../settings';
import { atomic } from './transaction';

export async function leaderboard(
  options: {
    cityId?: string;
    memberId?: string;
    month?: string;
    eventId?: string;
  } = {},
) {
  const mode = await getSetting(db, 'leaderboardPeriod');
  const events =
    mode === 'EVENT'
      ? await db.event.findMany({
          where: { status: { not: 'DRAFT' }, startsAt: { lte: new Date() } },
          select: { id: true, title: true, startsAt: true, endsAt: true },
          orderBy: { startsAt: 'desc' },
        })
      : [];
  const selectedEvent =
    events.find((e) => e.id === options.eventId) ??
    (!options.eventId ? events[0] : undefined);
  const window = leaderboardWindow(
    mode,
    new Date(),
    options.month,
    selectedEvent,
  );
  if (!window && (options.month || options.eventId))
    throw new AppError('VALIDATION', 422);
  const cities = await db.city.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (!window)
    return {
      mode,
      periodStart: null,
      periodEnd: null,
      entries: [],
      self: null,
      cities,
      events,
    };
  const ledgerWhere: Prisma.XpLedgerWhereInput = {
    delta: { gt: 0 },
    reason: { not: 'REFUND' },
    createdAt: { gte: window.start, lt: window.end },
  };
  if (mode === 'EVENT' && selectedEvent) {
    const [checkIns, reports, redemptions] = await Promise.all([
      db.checkIn.findMany({
        where: { eventId: selectedEvent.id },
        select: { id: true },
      }),
      db.promoterReport.findMany({
        where: { eventId: selectedEvent.id },
        select: { id: true },
      }),
      db.redemption.findMany({
        where: { eventId: selectedEvent.id },
        select: { id: true },
      }),
    ]);
    delete ledgerWhere.createdAt;
    ledgerWhere.OR = [
      { refType: 'CheckIn', refId: { in: checkIns.map((r) => r.id) } },
      { refType: 'PromoterReport', refId: { in: reports.map((r) => r.id) } },
      { refType: 'Redemption', refId: { in: redemptions.map((r) => r.id) } },
    ];
  }
  const totals = await db.xpLedger.groupBy({
    by: ['memberId'],
    where: {
      ...ledgerWhere,
      member: {
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        ...(options.cityId ? { cityId: options.cityId } : {}),
      },
    },
    _sum: { delta: true },
    _max: { createdAt: true },
  });
  const members = await db.member.findMany({
    where: { id: { in: totals.map((t) => t.memberId) } },
    select: {
      id: true,
      fullName: true,
      nim: true,
      photoUrl: true,
      city: { select: { name: true } },
    },
  });
  const byId = new Map(members.map((m) => [m.id, m]));
  const all = rankMembers(
    totals.map((t) => {
      const m = byId.get(t.memberId)!;
      return {
        memberId: m.id,
        name: m.fullName,
        nim: m.nim,
        photoUrl: m.photoUrl,
        city: m.city.name,
        xp: t._sum.delta ?? 0,
        reachedAt: t._max.createdAt!.toISOString(),
      };
    }),
  );
  const top = await getSetting(db, 'leaderboardTopN');
  // NIM and tie-break timestamps stay on the server; public entries expose display data only.
  const publicEntry = (r: (typeof all)[number]) => ({
    memberId: r.memberId,
    name: r.name,
    photoUrl: r.photoUrl,
    city: r.city,
    xp: r.xp,
    rank: r.rank,
  });
  let own = all.find((r) => r.memberId === options.memberId);
  if (!own && options.memberId) {
    const m = await db.member.findFirst({
      where: {
        id: options.memberId,
        status: 'ACTIVE',
        ...(options.cityId ? { cityId: options.cityId } : {}),
      },
      select: {
        id: true,
        fullName: true,
        photoUrl: true,
        city: { select: { name: true } },
      },
    });
    if (m)
      own = {
        memberId: m.id,
        name: m.fullName,
        photoUrl: m.photoUrl,
        city: m.city.name,
        xp: 0,
        rank: all.length + 1,
        nim: '',
        reachedAt: '',
      };
  }
  return {
    mode,
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    entries: all.slice(0, top).map(publicEntry),
    self: own ? publicEntry(own) : null,
    cities,
    events: events.map(({ id, title }) => ({ id, title })),
  };
}

/** The unique hour/scope key uses the existing id field, so cron retries create no duplicates. */
export async function snapshotLeaderboards() {
  const cities = await db.city.findMany({
    where: { active: true },
    select: { id: true },
  });
  const hour = new Date();
  hour.setUTCMinutes(0, 0, 0);
  let count = 0;
  const mode = await getSetting(db, 'leaderboardPeriod');
  const currentMonth = zonedParts(hour);
  const previous = new Date(
    Date.UTC(currentMonth.year, mode === 'QUARTERLY' ? Math.floor((currentMonth.month - 1) / 3) * 3 : currentMonth.month - 1, 0),
  );
  const previousMonth = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
  for (const cityId of [undefined, ...cities.map((c) => c.id)]) {
    // Keep one final snapshot for the closed month as well as hourly snapshots of the open one.
    for (const month of (mode === 'MONTHLY' || mode === 'QUARTERLY')
      ? [undefined, previousMonth]
      : [undefined]) {
      const board = await leaderboard({ cityId, month });
      if (!board.periodStart || !board.periodEnd) continue;
      const id = `${month ? 'closed' : hour.toISOString()}:${cityId ?? 'NATIONAL'}:${board.periodStart}`;
      await atomic(async (tx) =>
        tx.leaderboardSnapshot.upsert({
          where: { id },
          create: {
            id,
            scope: cityId ? 'CITY' : 'NATIONAL',
            cityId,
            periodStart: new Date(board.periodStart!),
            periodEnd: new Date(board.periodEnd!),
            entries: board.entries as unknown as Prisma.InputJsonValue,
            computedAt: hour,
          },
          update: {},
        }),
      );
      count++;
    }
  }
  return count;
}
