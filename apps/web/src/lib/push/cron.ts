import 'server-only';
import { formatTime } from '@pats/shared';
import { db } from '../db';
import { isUniqueViolation } from '../db-errors';
import { getSetting } from '../settings';
import { notifyUsers } from './notify';
import { duePushes, type DuePush } from './schedule';

/** Claims a scheduled push; false when another run already sent it. */
async function claim(key: string): Promise<boolean> {
  try {
    await db.pushDispatch.create({ data: { key } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/**
 * Reminders and follow-ups for every city (called by the systemd timer every 5 minutes through
 * POST /api/cron/notifications). Copy comes from City.notificationCopy, else the defaults.
 */
export async function runNotificationCron(now = new Date()) {
  const cities = await db.city.findMany({ where: { active: true }, select: { id: true, name: true, timezone: true } });
  const sent: (DuePush & { recipients: number })[] = [];
  for (const city of cities) {
    const [reminderTime, followUpTime] = await Promise.all([
      getSetting(db, 'reminderTime', { cityId: city.id }),
      getSetting(db, 'followUpTime', { cityId: city.id }),
    ]);
    // Events from 2 days ago to 4 days ahead cover every window.
    const events = await db.event.findMany({
      where: {
        cityId: city.id,
        status: { not: 'DRAFT' },
        startsAt: { gte: new Date(now.getTime() - 2 * 86_400_000), lte: new Date(now.getTime() + 4 * 86_400_000) },
      },
      include: { venue: { select: { name: true } } },
    });
    const due = duePushes(events, { timeZone: city.timezone, reminderTime, followUpTime, now });
    for (const push of due) {
      const event = events.find((e) => e.id === push.eventId)!;
      if (!(await claim(`${push.kind}:${event.id}`))) continue;
      const checkedIn = await db.checkIn.findMany({ where: { eventId: event.id }, select: { member: { select: { userId: true } } } });
      const attended = new Set(checkedIn.map((c) => c.member.userId));
      let userIds: string[];
      if (push.kind === 'thankYou') userIds = [...attended];
      else {
        const members = await db.member.findMany({ where: { cityId: city.id, status: 'ACTIVE', user: { status: 'ACTIVE' } }, select: { userId: true } });
        userIds = members.map((m) => m.userId).filter((id) => push.kind !== 'fomo' || !attended.has(id));
      }
      const result = await notifyUsers(userIds, {
        kind: push.kind,
        cityId: city.id,
        values: { event: event.title, venue: event.venue?.name ?? city.name, time: formatTime(event.startsAt, { timeZone: city.timezone }), city: city.name },
        data: { screen: 'event', eventId: event.id },
      });
      await db.pushDispatch.update({ where: { key: `${push.kind}:${event.id}` }, data: { recipientCount: result.stored } });
      sent.push({ ...push, recipients: result.stored });
    }
  }
  return { ranAt: now.toISOString(), sent };
}
