import type { NotificationListResponse } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/http/respond';

/** The notification centre: the latest 100, newest first, and the unread count. */
export const GET = route(async (req: Request) => {
  const user = await requireApiUser(req);
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { sentAt: 'desc' }, take: 100 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const body: NotificationListResponse = {
    unread,
    notifications: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      sentAt: n.sentAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
      data: n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? (n.data as Record<string, string>) : null,
    })),
  };
  return ok(body);
});
