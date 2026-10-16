import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../src/generated/prisma';
vi.mock('../../src/lib/db', () => ({ db: {} }));
import { expireInTransaction } from '../../src/lib/loyalty/rewards';

describe('redemption refund ledger', () => {
  let status: string;
  let stock: number;
  let credits: number[];
  let now: Date;
  beforeEach(() => {
    status = 'ISSUED';
    stock = 2;
    credits = [];
    now = new Date('2026-10-16T12:15:00Z');
  });
  const tx = () =>
    ({
      redemption: {
        findMany: vi.fn(async () =>
          status === 'ISSUED'
            ? [{ id: 'redemption', memberId: 'member', rewardId: 'reward' }]
            : [],
        ),
        updateMany: vi.fn(async () => {
          if (status !== 'ISSUED') return { count: 0 };
          status = 'EXPIRED';
          return { count: 1 };
        }),
      },
      xpLedger: {
        findFirst: vi.fn(async () => ({ id: 'debit', delta: -100, createdAt: now })),
        findMany: vi.fn(async () => [{ id: 'earn', delta: 100, reason: 'CHECK_IN', createdAt: new Date('2026-01-01'), expiresAt: new Date('2027-07-01'), refId: null }]),
        create: vi.fn(async ({ data }: { data: { delta: number } }) => {
          credits.push(data.delta);
        }),
      },
      reward: {
        updateMany: vi.fn(async () => {
          stock++;
          return { count: 1 };
        }),
      },
    }) as unknown as Prisma.TransactionClient;
  it('refunds the original debit and returns stock exactly once across repeated expiry runs', async () => {
    const client = tx();
    await expireInTransaction(client, 'member', now);
    await expireInTransaction(client, 'member', now);
    expect(status).toBe('EXPIRED');
    expect(credits).toEqual([100]);
    expect(stock).toBe(3);
  });
  it('does not refund when another transaction already claimed the code', async () => {
    const client = tx();
    vi.mocked(client.redemption.updateMany).mockResolvedValue({ count: 0 });
    await expireInTransaction(client, 'member', now);
    expect(credits).toEqual([]);
    expect(stock).toBe(2);
  });
  it('reconstructs original expiry for a pre-migration debit without allocations', async () => {
    const client = tx();
    await expireInTransaction(client, 'member', now);
    expect(client.xpLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: 100, expiresAt: new Date('2027-07-01') }) });
  });
  it('restores each spent lot with its own original expiry', async () => {
    const client = tx();
    vi.mocked(client.xpLedger.findFirst).mockResolvedValue({ delta: -100, allocations: [{ amount: 30, expiresAt: '2026-10-16T12:00:00Z' }, { amount: 70, expiresAt: '2027-07-01T00:00:00Z' }] } as never);
    await expireInTransaction(client, 'member', now);
    expect(credits).toEqual([30, 70]);
    expect(client.xpLedger.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ delta: 30, expiresAt: new Date('2026-10-16T12:00:00Z') }) });
    expect(client.xpLedger.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ delta: 70, expiresAt: new Date('2027-07-01T00:00:00Z') }) });
  });
});
