import { zonedParts, type NotificationKind } from '@pats/shared';

/**
 * When scheduled pushes are due (PRODUCT.md §4.2, §8), in the city's own time zone:
 *   reminder3d / reminder1d / reminderToday  at reminderTime, 3 days / 1 day before / on the day
 *   thankYou / fomo                           at followUpTime the day after the event's date
 * Pure, so the cron and the tests agree. A run that comes late (server down) still sends the
 * same day; the dispatch table makes each one go out once.
 */

export interface ScheduleEvent {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

export interface DuePush {
  kind: Extract<NotificationKind, 'reminder3d' | 'reminder1d' | 'reminderToday' | 'thankYou' | 'fomo'>;
  eventId: string;
}

/** Days since 1970-01-01 of the calendar date `date` falls on in `timeZone`. */
export function localDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function duePushes(
  events: readonly ScheduleEvent[],
  opts: { timeZone: string; reminderTime: string; followUpTime: string; now: Date },
): DuePush[] {
  const { timeZone, now } = opts;
  const today = localDay(now, timeZone);
  const p = zonedParts(now, timeZone);
  const minuteNow = p.hour * 60 + p.minute;
  const out: DuePush[] = [];
  for (const e of events) {
    const day = localDay(e.startsAt, timeZone);
    if (minuteNow >= minutesOf(opts.reminderTime)) {
      if (day - today === 3) out.push({ kind: 'reminder3d', eventId: e.id });
      if (day - today === 1) out.push({ kind: 'reminder1d', eventId: e.id });
      // Not for an event that has already started by reminder time.
      if (day === today && e.startsAt > now) out.push({ kind: 'reminderToday', eventId: e.id });
    }
    if (today - day === 1 && minuteNow >= minutesOf(opts.followUpTime) && e.endsAt <= now) {
      out.push({ kind: 'thankYou', eventId: e.id }, { kind: 'fomo', eventId: e.id });
    }
  }
  return out;
}
