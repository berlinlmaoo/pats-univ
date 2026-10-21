import 'server-only';
import {
  cityCopy,
  createTranslator,
  fillCopy,
  NOTIFICATION_CATEGORY,
  type Locale,
  type MessageKey,
  type NotificationKind,
  type NotificationPrefs,
} from '@pats/shared';
import { db } from '../db';
import { env } from '../env';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export interface NotifyInput {
  kind: NotificationKind;
  /** City whose copy overrides apply (event and card messages). */
  cityId?: string | null;
  /** Placeholder values ({event}, {venue}, {time}, {city}, …), or per-language ones; {name} is filled per user. */
  values?: Record<string, string | ((locale: Locale) => string)>;
  /** Where tapping it leads in the app. */
  data?: Record<string, string>;
}

export interface NotifyResult {
  /** Notifications stored (one per user: the in-app centre). */
  stored: number;
  /** Push messages handed to Expo. */
  pushed: number;
}

export function prefsOf(raw: unknown): NotificationPrefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotificationPrefs>;
  return { events: p.events !== false, activity: p.activity !== false };
}

/**
 * Stores a notification for each user (the in-app centre, PRODUCT.md §8) and pushes it to their
 * devices unless they turned that category off. Never throws: a failed push must not undo the
 * check-in or hand-over that triggered it.
 */
export async function notifyUsers(userIds: readonly string[], input: NotifyInput): Promise<NotifyResult> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { stored: 0, pushed: 0 };
  try {
    const [users, city] = await Promise.all([
      db.user.findMany({
        where: { id: { in: ids }, status: 'ACTIVE' },
        select: { id: true, name: true, locale: true, notificationPrefs: true, devices: { select: { pushToken: true } } },
      }),
      input.cityId ? db.city.findUnique({ where: { id: input.cityId }, select: { notificationCopy: true, name: true } }) : null,
    ]);
    const category = NOTIFICATION_CATEGORY[input.kind];
    const rows = users.map((u) => {
      const t = createTranslator(u.locale);
      const values: Record<string, string> = { name: u.name.split(/\s+/)[0] ?? u.name, city: city?.name ?? '' };
      for (const [k, v] of Object.entries(input.values ?? {})) values[k] = typeof v === 'function' ? v(u.locale) : v;
      const body = cityCopy(city?.notificationCopy, input.kind, u.locale) ?? t(`push.${input.kind}.body` as MessageKey);
      return {
        user: u,
        data: {
          userId: u.id,
          kind: input.kind,
          title: fillCopy(t(`push.${input.kind}.title` as MessageKey), values),
          body: fillCopy(body, values),
          data: input.data ?? undefined,
        },
      };
    });
    const created = await db.notification.createManyAndReturn({ data: rows.map((r) => r.data), select: { id: true, userId: true } });
    const idByUser = new Map(created.map((c) => [c.userId, c.id]));

    const messages = rows.flatMap(({ user, data }) => {
      const allowed = category === 'account' || prefsOf(user.notificationPrefs)[category];
      if (!allowed) return [];
      return user.devices.map((d) => ({
        to: d.pushToken,
        title: data.title,
        body: data.body,
        sound: 'default' as const,
        data: { ...input.data, notificationId: idByUser.get(user.id) ?? '', kind: input.kind },
      }));
    });
    const pushed = await sendPush(messages);
    return { stored: created.length, pushed };
  } catch (err) {
    console.error('[push] notify failed', input.kind, err);
    return { stored: 0, pushed: 0 };
  }
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, string>;
}

/** Expo Push API in chunks of 100. Tokens Expo reports as unregistered are dropped. */
async function sendPush(messages: PushMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  const e = env();
  if (e.PUSH_PROVIDER === 'log') {
    console.info(`[push] log provider: ${messages.length} message(s) not sent`, messages.slice(0, 3).map((m) => m.title));
    return messages.length;
  }
  let sent = 0;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(e.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${e.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
      if (!res.ok || !json?.data) {
        console.warn('[push] Expo rejected a chunk', res.status, JSON.stringify(json)?.slice(0, 300));
        continue;
      }
      const dead: string[] = [];
      json.data.forEach((ticket, j) => {
        if (ticket.status === 'ok') sent++;
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(chunk[j]!.to);
      });
      if (dead.length) await db.device.deleteMany({ where: { pushToken: { in: dead } } });
    } catch (err) {
      console.warn('[push] Expo unreachable', String(err));
    }
  }
  return sent;
}

/** A claim decision stores its notification in the same transaction as the XP award. */
export async function deliverStoredNotification(id: string) {
  const row = await db.notification.findUnique({ where: { id }, include: { user: { include: { devices: true } } } });
  if (!row || !prefsOf(row.user.notificationPrefs).activity) return;
  try {
    await sendPush(row.user.devices.map(d => ({ to: d.pushToken, title: row.title, body: row.body,
      sound: 'default' as const, data: { ...(row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? (row.data as Record<string, string>) : {}), notificationId: row.id, screen: 'claims', kind: row.kind } })));
  } catch { console.warn('[push] claim notification delivery pending', id); }
}
