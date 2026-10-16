import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../src/lib/auth/current-user';
vi.mock('../../src/lib/db', () => ({ db: {} }));
const fixture = vi.hoisted(() => ({
  status: 'SUBMITTED',
  credits: [] as number[],
  payouts: [] as { status: string; amount: number }[],
  kind: 'XP',
  tx: {} as Record<string, unknown>,
}));
vi.mock('../../src/lib/loyalty/transaction', () => ({
  atomic: (fn: (tx: unknown) => Promise<unknown>) => fn(fixture.tx),
}));
vi.mock('../../src/lib/settings', () => ({
  getSetting: async (_: unknown, key: string) =>
    key === 'promoterBonusKind'
      ? fixture.kind
      : key === 'promoterBonusPerGuestXp'
        ? 20
        : 5,
}));
import { reviewReport } from '../../src/lib/loyalty/promoter';
const admin = {
  id: 'crew',
  role: 'LOCAL_ADMIN',
  cityId: 'jakarta',
} as AuthUser;
describe('PR crediting', () => {
  beforeEach(() => {
    fixture.status = 'SUBMITTED';
    fixture.credits = [];
    fixture.payouts = [];
    fixture.kind = 'XP';
    fixture.tx = {
      promoterReport: {
        findUnique: async () => ({
          id: 'report',
          memberId: 'member',
          cityId: 'jakarta',
          guestCount: 12,
          receiptAmount: 6000000,
          status: fixture.status,
          bonusKind: fixture.kind,
          bonusValue: 240,
          payouts: fixture.payouts,
        }),
        update: async ({ data }: { data: { status: string } }) => {
          fixture.status = data.status;
          return data;
        },
      },
      xpLedger: {
        create: async ({ data }: { data: { delta: number } }) => {
          fixture.credits.push(data.delta);
        },
      },
      promoterPayout: {
        create: async ({ data }: { data: { amount: number } }) => {
          fixture.payouts.push({ status: 'PENDING', amount: data.amount });
        },
        deleteMany: async () => {
          fixture.payouts = [];
        },
      },
      auditLog: { create: async () => ({}) },
    };
  });
  it('credits 240 XP exactly once and refuses a second validation', async () => {
    await reviewReport(admin, 'report', { action: 'validate' });
    await expect(
      reviewReport(admin, 'report', { action: 'validate' }),
    ).rejects.toMatchObject({ code: 'REPORT_REVIEWED' });
    expect(fixture.credits).toEqual([240]);
  });
  it('rejects another city before crediting', async () => {
    await expect(
      reviewReport({ ...admin, cityId: 'bandung' }, 'report', {
        action: 'validate',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fixture.credits).toEqual([]);
  });
  it('writes a pending payout instead of an XP credit for cash', async () => {
    fixture.kind = 'CASH';
    await reviewReport(admin, 'report', { action: 'validate' });
    expect(fixture.credits).toEqual([]);
    expect(fixture.payouts).toEqual([{ status: 'PENDING', amount: 300000 }]);
  });
  it('reverses a validated XP bonus once, then permits resubmission', async () => {
    await reviewReport(admin, 'report', { action: 'validate' });
    await reviewReport(admin, 'report', {
      action: 'cancel',
      reason: 'Correct receipt',
    });
    expect(fixture.status).toBe('REJECTED');
    expect(fixture.credits).toEqual([240, -240]);
    await expect(
      reviewReport(admin, 'report', { action: 'cancel', reason: 'Again' }),
    ).rejects.toMatchObject({ code: 'REPORT_REVIEWED' });
  });
});
