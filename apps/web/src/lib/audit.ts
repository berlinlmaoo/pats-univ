import 'server-only';
import type { Prisma } from '@/generated/prisma';
import { db } from './db';

export async function audit(
  actorId: string,
  action: string,
  target: { type: string; id?: string },
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({ data: { actorId, action, targetType: target.type, targetId: target.id, meta } });
}
