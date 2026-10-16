import { z } from 'zod';
import { parseZonedDateTime } from './event';
import { zonedParts } from './format';

export interface LedgerEntry {
  delta: number;
  reason: string;
  createdAt: Date | string;
}
export const xpBalance = (rows: readonly Pick<LedgerEntry, 'delta'>[]) =>
  rows.reduce((n, row) => n + row.delta, 0);
export const earnedXp = (rows: readonly LedgerEntry[]) =>
  rows.reduce((n, row) => n + Math.max(0, row.delta), 0);

export interface RankedMember {
  memberId: string;
  name: string;
  nim: string;
  city: string;
  photoUrl: string | null;
  xp: number;
  reachedAt: string;
  rank: number;
}
export function rankMembers(
  rows: readonly Omit<RankedMember, 'rank'>[],
): RankedMember[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.xp - a.xp ||
        a.reachedAt.localeCompare(b.reachedAt) ||
        a.nim.localeCompare(b.nim),
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Monthly boundaries are calendar boundaries in WIB, rather than UTC months. */
export function leaderboardWindow(
  mode: string,
  now: Date,
  month?: string,
  event?: { startsAt: Date; endsAt: Date },
) {
  if (mode === 'EVENT') {
    if (!event) return null;
    return { start: event.startsAt, end: event.endsAt };
  }
  if (mode === 'ALL_TIME')
    return { start: new Date(0), end: new Date('9999-01-01T00:00:00Z') };
  const p = zonedParts(now);
  const selected = month ?? `${p.year}-${String(p.month).padStart(2, '0')}`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) return null;
  const [year, m] = selected.split('-').map(Number) as [number, number];
  if (year < 2000 || year > 9998) return null;
  const start = parseZonedDateTime(`${selected}-01`, '00:00', 'Asia/Jakarta');
  const next = new Date(Date.UTC(year, m, 1));
  const end = parseZonedDateTime(
    `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`,
    '00:00',
    'Asia/Jakarta',
  );
  return start && end ? { start, end } : null;
}

export function pickWeighted<T extends { spinWeight: number }>(
  rows: readonly T[],
  random: number,
): T | null {
  if (!Number.isFinite(random) || random < 0 || random >= 1)
    throw new RangeError('Random must be in [0, 1)');
  const pool = rows.filter(
    (r) => Number.isSafeInteger(r.spinWeight) && r.spinWeight > 0,
  );
  const total = pool.reduce((n, r) => n + r.spinWeight, 0);
  let cursor = random * total;
  for (const row of pool) {
    cursor -= row.spinWeight;
    if (cursor < 0) return row;
  }
  return null;
}
export const canSpin = (used: number, limit: number) => used < limit;
export const redeemExpiry = (now: Date, minutes: number) =>
  new Date(now.getTime() + minutes * 60_000);
export const isRedeemExpired = (expiresAt: Date, now: Date) => expiresAt <= now;
export function promoterBonus(
  kind: string,
  guests: number,
  perGuest: number,
  receiptAmount: number,
  percent: number,
) {
  return kind === 'CASH'
    ? Math.round((receiptAmount * percent) / 100)
    : guests * perGuest;
}

const id = z.string().min(1).max(200);
const count = z.number().int().min(0).max(1_000_000);
const money = z.number().int().min(0).max(2_000_000_000);
export const redeemInput = z.object({ rewardId: id, eventId: id });
export const spinInput = z.object({ eventId: id });
export const validateCodeInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/),
  eventId: id,
});
export const rewardInput = z.object({
  id: id.optional(),
  type: z.enum(['DIRECT', 'SPIN_PRIZE']),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  xpCost: count,
  cityId: id.nullable(),
  stock: count.nullable(),
  active: z.boolean(),
  spinWeight: z.number().int().min(0).max(1_000_000),
});
export const promoterInput = z.object({
  eventId: id,
  guestCount: count,
  receiptUrl: z
    .string()
    .regex(/^receipts\/[a-z0-9]+\/[a-f0-9-]+\.(jpg|png|webp)$/),
  receiptAmount: money.nullable().default(null),
  guests: z
    .array(
      z.object({
        name: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(30).optional(),
      }),
    )
    .max(1000)
    .default([]),
});
export const reviewInput = z
  .object({
    action: z.enum(['validate', 'reject', 'cancel']),
    reason: z.string().trim().max(1000).default(''),
  })
  .refine((r) => r.action === 'validate' || r.reason.length >= 3, {
    path: ['reason'],
    message: 'validation.required',
  });
export const recapInput = z
  .object({
    eventId: id,
    sofaCount: count,
    tableCount: count,
    fdcCount: count,
    paxCount: count,
    revenueSofa: money,
    revenueTable: money,
    revenueFdc: money,
    note: z.string().trim().max(2000).default(''),
  })
  .refine(
    (r) => r.revenueSofa + r.revenueTable + r.revenueFdc <= 2_000_000_000,
    { path: ['revenueFdc'], message: 'validation.numberInvalid' },
  );

export interface RewardDto {
  id: string;
  type: 'DIRECT' | 'SPIN_PRIZE';
  name: string;
  description: string;
  xpCost: number;
  cityId: string | null;
  stock: number | null;
  active: boolean;
  spinWeight: number;
}
export interface RedemptionDto {
  id: string;
  code: string;
  status: string;
  kind: string;
  expiresAt: string;
  issuedAt: string;
  reward: RewardDto;
  eventId: string | null;
}
export interface WalletDto {
  balance: number;
  isPromoter: boolean;
  ledger: { id: string; delta: number; reason: string; createdAt: string }[];
  milestone: { reward: RewardDto; remaining: number; progress: number } | null;
  rewards: RewardDto[];
  redemptions: RedemptionDto[];
  spinCostXp: number;
  maxSpinsPerEvent: number;
  events: { id: string; title: string; spinsUsed: number; spinLimit: number }[];
}
export type LeaderboardEntry = Omit<RankedMember, 'nim' | 'reachedAt'>;
export interface LeaderboardDto {
  mode: string;
  periodStart: string | null;
  periodEnd: string | null;
  entries: LeaderboardEntry[];
  self: LeaderboardEntry | null;
  cities: { id: string; name: string }[];
  events: { id: string; title: string }[];
}
export interface ReportDto {
  id: string;
  memberId: string;
  eventId: string;
  guestCount: number;
  receiptAmount: number | null;
  status: string;
  bonusKind: string | null;
  bonusValue: number | null;
  rejectReason: string | null;
  receiptUrl: string;
  guests: { name?: string; phone?: string }[];
  member: { fullName: string };
  event: { title: string; _count?: { checkIns: number } };
  payouts: { id: string; amount: number; status: string }[];
}
export interface RecapDto {
  eventId: string;
  sofaCount: number;
  tableCount: number;
  fdcCount: number;
  paxCount: number;
  revenueSofa: number;
  revenueTable: number;
  revenueFdc: number;
  total: number;
  note: string | null;
  lockedAt: string | null;
}
export interface OperationsDto {
  events: {
    id: string;
    title: string;
    city: { name: string };
    recap: RecapDto | null;
  }[];
  reports: ReportDto[];
  members: { id: string; fullName: string; nim: string; isPromoter: boolean }[];
  stats: {
    members: number;
    checkIns: number;
    fulfilled: number;
    revenue: number;
  };
}
