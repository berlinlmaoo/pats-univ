import 'server-only';
import { formatDate, formatTime } from '@pats/shared';
import type { AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { notifyUsers } from './notify';

/**
 * HQ broadcasts an event (with its flyer, if any) to every active member of the chosen cities.
 * Each city's own copy override applies to its members.
 */
export async function broadcastEvent(hq: AuthUser, eventId: string, cityIds: string[]) {
  const event = await db.event.findUnique({ where: { id: eventId }, include: { city: true, venue: { select: { name: true } } } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  if (event.status === 'DRAFT') throw new AppError('EVENT_NOT_OPEN', 409, 'Publish the event first');
  const cities = await db.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } });
  if (cities.length !== new Set(cityIds).size) throw new AppError('CITY_NOT_FOUND', 404);
  const tz = event.city.timezone;
  let recipients = 0;
  for (const city of cities) {
    const members = await db.member.findMany({ where: { cityId: city.id, status: 'ACTIVE', user: { status: 'ACTIVE' } }, select: { userId: true } });
    const res = await notifyUsers(members.map((m) => m.userId), {
      kind: 'eventBroadcast',
      cityId: city.id,
      values: {
        event: event.title,
        venue: event.venue?.name ?? event.city.name,
        time: (locale) => `${formatDate(event.startsAt, locale, { timeZone: tz })}, ${formatTime(event.startsAt, { timeZone: tz })}`,
        city: event.city.name,
      },
      data: { screen: 'event', eventId: event.id },
    });
    recipients += res.stored;
  }
  await db.auditLog.create({
    data: { actorId: hq.id, action: 'event.broadcast', targetType: 'Event', targetId: event.id, meta: { cities: cities.map((c) => c.name), recipients } },
  });
  return { recipients };
}
