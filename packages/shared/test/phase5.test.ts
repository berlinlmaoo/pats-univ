import { describe, expect, it } from 'vitest';
import { addMonths, can, claimInput, leaderboardWindow, prBonusXp, remainingXpLots } from '../src';
describe('team decisions', () => {
  it('uses WIB calendar quarters', () => {
    const q = leaderboardWindow('QUARTERLY', new Date('2026-09-30T17:00:00Z'))!;
    expect(q.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(q.end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });
  it('clamps expiry at month end and preserves the time', () => {
    expect(addMonths(new Date('2024-08-31T08:30:00Z'), 18).toISOString()).toBe('2026-02-28T08:30:00.000Z');
  });
  it('spends oldest remaining XP and applies expiry to its own earn', () => {
    const createdAt = new Date('2026-01-01');
    const row = (id: string, delta: number, reason = 'CHECK_IN', refId: string | null = null) => ({ id, delta, reason, createdAt, expiresAt: addMonths(createdAt, 18), refId });
    expect(remainingXpLots([row('a', 100), row('b', 50), row('spend', -75, 'REDEEM'), row('expire', -25, 'EXPIRE', 'a')])).toEqual([{ id: 'b', remaining: 50, expiresAt: addMonths(createdAt, 18) }]);
  });
  it('uses expiry priority for restored refunds', () => {
    const now = new Date();
    const rows = [
      { id: 'new', delta: 50, reason: 'CHECK_IN', createdAt: now, expiresAt: addMonths(now, 18), refId: null },
      { id: 'refund', delta: 20, reason: 'REFUND', createdAt: now, expiresAt: addMonths(now, 1), refId: 'redeem' },
      { id: 'spend', delta: -15, reason: 'REDEEM', createdAt: now, expiresAt: null, refId: null },
    ];
    expect(remainingXpLots(rows).map(l => [l.id, l.remaining])).toEqual([['refund', 5], ['new', 50]]);
  });
  it('calculates PR and member bonuses from configured rates', () => {
    expect(prBonusXp(12, 2, 5, 25)).toBe(110);
    expect(prBonusXp(0, 4, 5, 25)).toBe(100);
  });
  it('allows optional proof and rejects negative counts', () => {
    expect(claimInput.parse({ eventId: 'night', formType: 'MEMBER', reservationCount: 2 }).receiptUrl).toBe('');
    expect(claimInput.safeParse({ eventId: 'night', formType: 'PR', reservationCount: -1 }).success).toBe(false);
  });
  it('accepts both regional role names but restricts timeline publication to HQ', () => {
    expect(can('LOCAL_ADMIN', 'dashboard.access')).toBe(true);
    expect(can('REGIONAL_ADMIN', 'promoter.manage')).toBe(true);
    expect(can('REGIONAL_ADMIN', 'timeline.post')).toBe(false);
    expect(can('MEMBER', 'timeline.post')).toBe(false);
    expect(can('SUPER_ADMIN', 'timeline.post')).toBe(true);
  });
});
