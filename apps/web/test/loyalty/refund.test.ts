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
        findFirst: vi.fn(async () => ({ delta: -100 })),
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
});
