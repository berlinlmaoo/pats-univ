import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';

/** Mark ONE notification read when its content is opened (UX22). Idempotent. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await params;
  const row = await db.notification.findFirst({ where: { id, userId: user.id }, select: { id: true, readAt: true } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  const readAt = row.readAt ?? new Date();
  if (!row.readAt) await db.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt } });
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return ok({ id, readAt: readAt.toISOString(), unread });
});
