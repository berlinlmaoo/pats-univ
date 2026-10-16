/**
 * Event timing rules shared by the server, the dashboard and the app (PRODUCT.md §4.2, §6.1).
 * Status is what an admin set; the phase is what that means right now, given the check-in
 * window. Only the server decides whether a check-in is accepted; clients use the phase for labels.
 */
import type { EventStatus } from './enums';
import { parseIsoDate, zonedParts } from './format';

export type EventPhase = 'draft' | 'upcoming' | 'open' | 'closed' | 'ended';

export interface EventTiming {
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  checkInOpensAt: Date;
  checkInClosesAt: Date;
}

export function eventPhase(e: EventTiming, now: Date = new Date()): EventPhase {
  const t = now.getTime();
  if (e.status === 'DRAFT') return 'draft';
  if (e.status === 'OPEN') {
    if (t > e.checkInClosesAt.getTime()) return 'ended';
    if (t >= e.checkInOpensAt.getTime()) return 'open';
    return 'upcoming';
  }
  if (t > e.endsAt.getTime()) return 'ended';
  if (e.status === 'CLOSED') return 'closed';
  return 'upcoming';
}

/** True when the server would accept a check-in for this event at `now`. */
export function isCheckInOpen(e: EventTiming, now: Date = new Date()): boolean {
  return eventPhase(e, now) === 'open';
}

/**
 * UTC instant of a wall-clock time in `timeZone`. Handles zones with DST by re-checking the
 * offset at the resulting instant (Indonesian zones have none, but cities may be added later).
 */
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsetAt = (instant: number) => {
    const p = zonedParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant;
  };
  let guess = asUtc - offsetAt(asUtc);
  const second = asUtc - offsetAt(guess);
  if (second !== guess) guess = second;
  return new Date(guess);
}

/** "2026-10-18" + "20:00" in the city's zone -> UTC. Returns null for malformed input. */
export function parseZonedDateTime(date: string, time: string, timeZone: string): Date | null {
  const d = parseIsoDate(date);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!d || !t) return null;
  return zonedTimeToUtc({ ...d, hour: Number(t[1]), minute: Number(t[2]) }, timeZone);
}

/** Inverse of parseZonedDateTime, for prefilling edit forms: { date: "2026-10-18", time: "20:00" }. */
export function toZonedInput(instant: Date, timeZone: string): { date: string; time: string } {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/**
 * Start, end and check-in window from form fields. Nights run past midnight: an end time at or
 * before the start time means the next day. The window opens `opensBeforeMinutes` before the
 * start and closes when the event ends (PRODUCT.md §6.1.6).
 */
export function eventTimesFromInput(
  input: { date: string; startTime: string; endTime: string; opensBeforeMinutes: number },
  timeZone: string,
): { startsAt: Date; endsAt: Date; checkInOpensAt: Date; checkInClosesAt: Date } | null {
  const startsAt = parseZonedDateTime(input.date, input.startTime, timeZone);
  let endsAt = parseZonedDateTime(input.date, input.endTime, timeZone);
  if (!startsAt || !endsAt) return null;
  if (endsAt.getTime() <= startsAt.getTime()) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  return {
    startsAt,
    endsAt,
    checkInOpensAt: new Date(startsAt.getTime() - input.opensBeforeMinutes * 60 * 1000),
    checkInClosesAt: endsAt,
  };
}
