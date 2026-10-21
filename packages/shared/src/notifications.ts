/**
 * Push notification kinds (PRODUCT.md §8). Default copy lives in i18n (`push.<kind>.title/body`);
 * HQ can override the body per city in `City.notificationCopy` ({ kind: { id, en } }), with the
 * placeholders {name} {event} {venue} {time} {city}.
 */
import { z } from 'zod';
import type { NotificationCategory } from './api';
import type { Locale } from './i18n/types';

export const NOTIFICATION_KINDS = [
  'hubMention',
  'roamingRequested',
  'roamingDecided',
  'reservationRequested',
  'reservationDecided',
  'eventBroadcast',
  'reminder3d',
  'reminder1d',
  'reminderToday',
  'thankYou',
  'fomo',
  'checkIn',
  'cardShipped',
  'cardDelivered',
  'reencodeApproved',
  'reencodeRejected',
  'contentSubmitted',
  'contentDecided',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_CATEGORY: Record<NotificationKind, NotificationCategory | 'account'> = {
  hubMention: 'account',
  roamingRequested: 'account',
  roamingDecided: 'activity',
  reservationRequested: 'account',
  reservationDecided: 'activity',
  eventBroadcast: 'events',
  reminder3d: 'events',
  reminder1d: 'events',
  reminderToday: 'events',
  thankYou: 'events',
  fomo: 'events',
  checkIn: 'activity',
  cardShipped: 'activity',
  cardDelivered: 'activity',
  // Crew-facing and account-level: always delivered.
  reencodeApproved: 'account',
  reencodeRejected: 'account',
  // Poster/description approval between a regional admin and HQ (staff work).
  contentSubmitted: 'account',
  contentDecided: 'account',
};

/** Kinds whose copy HQ can change per city (the member-facing event and card messages). */
export const CITY_COPY_KINDS = [
  'eventBroadcast',
  'reminder3d',
  'reminder1d',
  'reminderToday',
  'thankYou',
  'fomo',
  'checkIn',
  'cardShipped',
] as const satisfies readonly NotificationKind[];
export type CityCopyKind = (typeof CITY_COPY_KINDS)[number];

export const PLACEHOLDERS = ['name', 'event', 'venue', 'time', 'city'] as const;

const copyText = z.string().trim().max(240, 'validation.tooLong');

/** Stored shape of City.notificationCopy; empty strings mean "use the default". */
export const notificationCopySchema = z.partialRecord(
  z.enum(CITY_COPY_KINDS),
  z.object({ id: copyText.optional(), en: copyText.optional() }),
);
export type NotificationCopy = z.infer<typeof notificationCopySchema>;

/** The city's override for this kind and language, if HQ set one. */
export function cityCopy(copy: unknown, kind: NotificationKind, locale: Locale): string | null {
  const parsed = notificationCopySchema.safeParse(copy ?? {});
  if (!parsed.success) return null;
  const entry = (parsed.data as Record<string, { id?: string; en?: string } | undefined>)[kind];
  const text = entry?.[locale]?.trim();
  return text ? text : null;
}

/** Fills {placeholders}; unknown ones stay visible so a typo in the copy is easy to spot. */
export function fillCopy(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}
