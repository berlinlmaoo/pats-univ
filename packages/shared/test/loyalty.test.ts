import { describe, expect, it } from 'vitest';
import {
  canSpin,
  earnedXp,
  isRedeemExpired,
  leaderboardWindow,
  pickWeighted,
  promoterBonus,
  promoterInput,
  rankMembers,
  recapInput,
  redeemExpiry,
  xpBalance,
} from '../src/loyalty';

describe('XP ledger arithmetic', () => {
  it('keeps debits and refunds append-only; balance differs from positive period credits', () => {
    const rows = [50, 50, -100, 100, -250, 240].map((delta) => ({
      delta,
      reason: 'ADJUST',
      createdAt: new Date(),
    }));
    expect(xpBalance(rows)).toBe(90);
    expect(earnedXp(rows)).toBe(440);
    expect(xpBalance([])).toBe(0);
  });
});
describe('leaderboard', () => {
  const row = (
    memberId: string,
    xp: number,
    reachedAt: string,
    nim: string,
  ) => ({
    memberId,
    xp,
    reachedAt,
    nim,
    name: memberId,
    city: 'Jakarta',
    photoUrl: null,
  });
  it('orders ties by first reaching the positive total, then NIM', () => {
    const rows = [
      row('later', 100, '2026-10-02', 'JKT001'),
      row('nim2', 100, '2026-10-01', 'JKT002'),
      row('nim1', 100, '2026-10-01', 'JKT001'),
      row('highest', 200, '2026-10-03', 'JKT003'),
    ];
    expect(rankMembers(rows).map((r) => [r.memberId, r.rank])).toEqual([
      ['highest', 1],
      ['nim1', 2],
      ['nim2', 3],
      ['later', 4],
    ]);
    expect(rows[0]!.memberId).toBe('later');
  });
  it('uses WIB month boundaries including year rollover', () => {
    expect(
      leaderboardWindow('MONTHLY', new Date('2026-12-31T18:00:00Z')),
    ).toEqual({
      start: new Date('2026-12-31T17:00:00Z'),
      end: new Date('2027-01-31T17:00:00Z'),
    });
    expect(leaderboardWindow('MONTHLY', new Date(), '2026-13')).toBeNull();
    expect(leaderboardWindow('EVENT', new Date())).toBeNull();
    expect(leaderboardWindow('ALL_TIME', new Date())!.start.getTime()).toBe(0);
  });
});
describe('redemption expiry', () => {
  it('expires at the exact TTL boundary', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const expiry = redeemExpiry(now, 15);
    expect(expiry.toISOString()).toBe('2026-10-16T12:15:00.000Z');
    expect(isRedeemExpired(expiry, new Date('2026-10-16T12:14:59.999Z'))).toBe(
      false,
    );
    expect(isRedeemExpired(expiry, expiry)).toBe(true);
  });
});
describe('weighted spin and limits', () => {
  const pool = [
    { id: 'a', spinWeight: 1 },
    { id: 'b', spinWeight: 3 },
    { id: 'zero', spinWeight: 0 },
  ];
  it('covers probability boundaries and excludes zero weights', () => {
    expect(pickWeighted(pool, 0)?.id).toBe('a');
    expect(pickWeighted(pool, 0.249999)?.id).toBe('a');
    expect(pickWeighted(pool, 0.25)?.id).toBe('b');
    expect(pickWeighted(pool, 0.99999)?.id).toBe('b');
    expect(pickWeighted([{ spinWeight: 0 }], 0.5)).toBeNull();
    expect(() => pickWeighted(pool, 1)).toThrow();
  });
  it('six equal prizes occupy six equal ranges', () => {
    const pool = Array.from({ length: 6 }, (_, id) => ({ id, spinWeight: 1 }));
    expect(pool.map((_, i) => pickWeighted(pool, (i + 0.5) / 6)?.id)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
  it('refuses the sixth spin, and respects a zero limit', () => {
    expect(canSpin(4, 5)).toBe(true);
    expect(canSpin(5, 5)).toBe(false);
    expect(canSpin(0, 0)).toBe(false);
  });
});
describe('promoter bonuses and recap input', () => {
  it('credits 12 guests with 240 XP and rounds cash to whole rupiah', () => {
    expect(promoterBonus('XP', 12, 20, 6_000_000, 0)).toBe(240);
    expect(promoterBonus('CASH', 12, 20, 6_000_000, 5)).toBe(300_000);
    expect(promoterBonus('CASH', 1, 20, 101, 5)).toBe(5);
  });
  it('refuses a public receipt URL and invalid guest counts', () => {
    expect(
      promoterInput.safeParse({
        eventId: 'event',
        guestCount: 12,
        receiptUrl: 'https://public/receipt.jpg',
      }).success,
    ).toBe(false);
    expect(
      promoterInput.safeParse({
        eventId: 'event',
        guestCount: -1,
        receiptUrl: 'receipts/member/abcd.jpg',
      }).success,
    ).toBe(false);
  });
  it('rejects revenue overflow rather than overflowing the database integer', () => {
    expect(
      recapInput.safeParse({
        eventId: 'event',
        sofaCount: 3800,
        tableCount: 0,
        fdcCount: 0,
        paxCount: 0,
        revenueSofa: 2_000_000_000,
        revenueTable: 1,
        revenueFdc: 0,
      }).success,
    ).toBe(false);
  });
});
