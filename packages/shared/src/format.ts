/**
 * Number, money and date formatting. Every screen and export goes through these helpers so
 * the house style stays the same everywhere (PLAN.md §6):
 *   counts  -> 3.800            (dot thousands separator, no currency)
 *   money   -> Rp 6.000.000     (space after Rp, no decimals)
 *   dates   -> 14 Oct / 14 Okt  (year only when it is not the current year)
 *   times   -> 19.30 WIB
 */
import type { Locale } from './i18n/types';

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** 3800 -> "3.800". Negative numbers keep a real minus sign. */
export function formatCount(value: number): string {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().replace(THOUSANDS, '.');
  return rounded < 0 ? `−${digits}` : digits;
}

/** 6000000 -> "Rp 6.000.000". */
export function formatRupiah(value: number): string {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().replace(THOUSANDS, '.');
  return rounded < 0 ? `−Rp ${digits}` : `Rp ${digits}`;
}

const MONTHS: Record<Locale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
};

/** Short zone label shown after times. Unknown zones fall back to the UTC offset. */
const ZONE_LABEL: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
};

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string = DEFAULT_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export interface DateFormatOptions {
  timeZone?: string;
  /** Reference "now" used to decide whether to hide the year. Defaults to the current time. */
  now?: Date;
  /** Always show the year (exports, legal text). */
  withYear?: boolean;
}

/** "14 Oct", or "14 Oct 2025" when the year differs from the current one. */
export function formatDate(date: Date, locale: Locale, opts: DateFormatOptions = {}): string {
  const tz = opts.timeZone ?? DEFAULT_TIMEZONE;
  const p = zonedParts(date, tz);
  const nowYear = zonedParts(opts.now ?? new Date(), tz).year;
  const base = `${p.day} ${MONTHS[locale][p.month - 1]}`;
  return opts.withYear || p.year !== nowYear ? `${base} ${p.year}` : base;
}

/** "Oct 2026" / "Okt 2026" (month is 1-based). */
export function formatMonth(year: number, month: number, locale: Locale): string {
  return `${MONTHS[locale][month - 1]} ${year}`;
}

/** "19.30 WIB". */
export function formatTime(date: Date, opts: { timeZone?: string; withZone?: boolean } = {}): string {
  const tz = opts.timeZone ?? DEFAULT_TIMEZONE;
  const p = zonedParts(date, tz);
  const hhmm = `${String(p.hour).padStart(2, '0')}.${String(p.minute).padStart(2, '0')}`;
  if (opts.withZone === false) return hhmm;
  return `${hhmm} ${zoneLabel(date, tz)}`;
}

/** "14 Oct, 19.30 WIB". */
export function formatDateTime(date: Date, locale: Locale, opts: DateFormatOptions = {}): string {
  return `${formatDate(date, locale, opts)}, ${formatTime(date, { timeZone: opts.timeZone })}`;
}

/** "WIB", "WITA", "WIT", or the UTC offset for other zones. */
export function zoneLabel(date: Date, timeZone: string): string {
  const known = ZONE_LABEL[timeZone];
  if (known) return known;
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value;
  return name ?? 'UTC';
}

/** Whole years between `dateOfBirth` (a calendar date) and `on`, in the given zone. */
export function ageOn(dateOfBirth: { year: number; month: number; day: number }, on: Date, timeZone = DEFAULT_TIMEZONE): number {
  const today = zonedParts(on, timeZone);
  let age = today.year - dateOfBirth.year;
  if (today.month < dateOfBirth.month || (today.month === dateOfBirth.month && today.day < dateOfBirth.day)) {
    age -= 1;
  }
  return age;
}

/** "2001-04-09" -> { year, month, day }, or null when it is not a real calendar date. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** "+6281322223333" -> "+62 813-2222-3333". Other countries are returned as stored. */
export function formatPhone(e164: string): string {
  const m = /^\+62(8\d{8,11})$/.exec(e164);
  if (!m) return e164;
  const local = m[1]!;
  return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
}
