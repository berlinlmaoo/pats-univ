import 'server-only';
import { addMonths, remainingXpLots } from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { db } from '../db';
import { getSetting } from '../settings';
import { atomic } from './transaction';

type Tx = Prisma.TransactionClient;
export async function creditXp(tx: Tx, data: Prisma.XpLedgerUncheckedCreateInput) {
  const createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
  const expiresAt = addMonths(createdAt, await getSetting(tx, 'xpExpiryMonths'));
  return tx.xpLedger.create({ data: { ...data, createdAt, expiresAt } });
}

export async function xpLots(tx: Tx, memberId: string) {
  return remainingXpLots(await tx.xpLedger.findMany({
    where: { memberId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  }));
}

/** Serializable callers retry conflicts; unique award keys also guard repeated cron jobs. */
export async function expireXp(tx: Tx, memberId: string, now = new Date()) {
  let expired = 0;
  for (const lot of await xpLots(tx, memberId)) {
    if (!lot.expiresAt || lot.expiresAt > now) continue;
    await tx.xpLedger.create({ data: {
      memberId, delta: -lot.remaining, reason: 'EXPIRE', refType: 'XpLedger', refId: lot.id,
      awardKey: `expire:${lot.id}`, createdAt: now,
    } });
    expired += lot.remaining;
  }
  return expired;
}

export async function expireAllXp() {
  const members = await db.xpLedger.findMany({
    where: { delta: { gt: 0 }, expiresAt: { lte: new Date() } },
    distinct: ['memberId'], select: { memberId: true },
  });
  let expired = 0;
  for (const { memberId } of members) expired += await atomic(tx => expireXp(tx, memberId));
  return expired;
}

export async function spendingSlices(tx: Tx, memberId: string, amount: number, before?: { id: string; createdAt: Date }) {
  const slices: { amount: number; expiresAt: string | null }[] = [];
  const lots = before ? remainingXpLots(await tx.xpLedger.findMany({
    where: { memberId, OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })) : await xpLots(tx, memberId);
  for (const lot of lots) {
    const used = Math.min(amount, lot.remaining);
    if (used) slices.push({ amount: used, expiresAt: lot.expiresAt?.toISOString() ?? null });
    amount -= used;
    if (!amount) break;
  }
  return slices;
}
