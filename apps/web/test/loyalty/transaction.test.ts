import { beforeEach, describe, expect, it, vi } from 'vitest';
const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../../src/lib/db', () => ({ db: { $transaction: transaction } }));
import {
  atomic,
  isRetryableTransaction,
} from '../../src/lib/loyalty/transaction';
beforeEach(() => {
  transaction.mockReset();
});
describe('serializable retry', () => {
  it('recognises Prisma conflicts and adapter commit-time serialization failures', () => {
    expect(isRetryableTransaction({ code: 'P2034' })).toBe(true);
    expect(
      isRetryableTransaction(
        new Error('commit', {
          cause: { originalCode: '40001', kind: 'TransactionWriteConflict' },
        }),
      ),
    ).toBe(true);
    expect(isRetryableTransaction({ cause: { originalCode: '40P01' } })).toBe(
      true,
    );
    expect(isRetryableTransaction({ code: 'P2025' })).toBe(false);
  });
  it('retries a commit conflict and returns the next transaction result', async () => {
    transaction
      .mockRejectedValueOnce(
        new Error('commit', { cause: { originalCode: '40001' } }),
      )
      .mockResolvedValueOnce('committed');
    await expect(atomic(async () => 'value')).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('does not retry authorization or validation errors', async () => {
    const error = new Error('forbidden');
    transaction.mockRejectedValue(error);
    await expect(atomic(async () => 0)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
