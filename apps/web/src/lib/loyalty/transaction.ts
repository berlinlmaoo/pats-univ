import 'server-only';
import { db } from '../db';
import type { Prisma } from '@/generated/prisma';

/** Driver adapters may expose commit-time conflicts through cause rather than a Prisma code. */
export function isRetryableTransaction(error: unknown): boolean {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === 'object';
    depth++
  ) {
    const value = current as {
      code?: string;
      originalCode?: string;
      kind?: string;
      cause?: unknown;
    };
    if (
      value.code === 'P2034' ||
      value.code === 'P2002' ||
      value.originalCode === '40001' ||
      value.originalCode === '40P01' ||
      value.kind === 'TransactionWriteConflict'
    )
      return true;
    current = value.cause;
  }
  return false;
}

/** Retry serialization failures: spending, stock, expiry and review always commit together. */
export async function atomic<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: 'Serializable',
        timeout: 15_000,
      });
    } catch (err) {
      if (!isRetryableTransaction(err) || attempt >= 5) throw err;
    }
  }
}
