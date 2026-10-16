/**
 * Physical card (KTM) helpers shared by the server, the dashboard and the app: the permanent card
 * URL written to the chip and printed as QR (PRODUCT.md §10.7), lookup parsing, the card and
 * batch status machines, and role capabilities for card work.
 */
import type { CardStatus, Role } from './enums';
import { NIM_PATTERN } from './nim';

/**
 * Origin of every card URL. Printed on the card and written to the chip, so it can never change
 * (PRODUCT.md §10.7). It is deliberately not taken from APP_URL: a card printed from a dev
 * machine must still carry the production URL.
 */
export const CARD_URL_ORIGIN = 'https://patsuniv.znetworks.id';

/** Card token: 16 random + 16 signature characters, base64url (see apps/web/src/lib/cards/token.ts). */
export const CARD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function cardUrl(token: string): string {
  return `${CARD_URL_ORIGIN}/c/${token}`;
}

/**
 * Token from a scanned or tapped card URL. Any host is accepted (a dev server, a future domain
 * that redirects): the server verifies the token's signature, which is what matters.
 */
export function tokenFromCardUrl(scanned: string): string | null {
  const match = /\/c\/([A-Za-z0-9_-]+)/.exec(scanned.trim());
  const token = match?.[1] ?? null;
  return token && CARD_TOKEN_PATTERN.test(token) ? token : null;
}

export type CardLookup = { kind: 'token'; token: string } | { kind: 'nim'; nim: string };

/** What an operator scanned (printed QR, a card URL) or typed (a NIM, or a bare token). */
export function parseCardLookup(input: string): CardLookup | null {
  const token = tokenFromCardUrl(input);
  if (token) return { kind: 'token', token };
  const raw = input.trim();
  if (CARD_TOKEN_PATTERN.test(raw)) return { kind: 'token', token: raw };
  const nim = raw.toUpperCase().replace(/\s+/g, '');
  return NIM_PATTERN.test(nim) ? { kind: 'nim', nim } : null;
}

/** Chip UID as stored and compared: upper-case hex, no separators (7 bytes for NTAG213). */
export function normalizeUid(uid: string): string | null {
  const hex = uid.replace(/[\s:-]/g, '').toUpperCase();
  return /^[0-9A-F]{8,20}$/.test(hex) && hex.length % 2 === 0 ? hex : null;
}

/** "04:A1:B2:…" for people; the API always uses the compact form. */
export function formatUid(uid: string): string {
  return uid.match(/.{1,2}/g)?.join(':') ?? uid;
}

// ─── Status machines ──────────────────────────────────────────────────────────

/** Statuses that count as "the member's card" (at most one per member, enforced by the DB). */
export const LIVE_CARD_STATUSES = ['NOT_PRINTED', 'IN_BATCH', 'SENT_TO_VENDOR', 'RECEIVED_HQ', 'ENCODED', 'DELIVERED'] as const satisfies readonly CardStatus[];

/** Next status in the print → encode → hand-over flow; REVOKED can be reached from any live one. */
export const CARD_NEXT: Record<CardStatus, CardStatus | null> = {
  NOT_PRINTED: 'IN_BATCH',
  IN_BATCH: 'SENT_TO_VENDOR',
  SENT_TO_VENDOR: 'RECEIVED_HQ',
  RECEIVED_HQ: 'ENCODED',
  ENCODED: 'DELIVERED',
  DELIVERED: null,
  REVOKED: null,
};

export function canTransitionCard(from: CardStatus, to: CardStatus): boolean {
  if (to === 'REVOKED') return from !== 'REVOKED';
  return CARD_NEXT[from] === to;
}

export const CARD_BATCH_STATUSES = ['EXPORTED', 'SENT_TO_VENDOR', 'RECEIVED_HQ', 'ENCODING', 'SHIPPED_TO_CITY', 'DONE'] as const;
export type CardBatchStatus = (typeof CARD_BATCH_STATUSES)[number];

/** Batch steps HQ triggers by hand. ENCODING and DONE follow from the cards themselves. */
export const BATCH_ACTIONS = ['sendToVendor', 'receiveAtHq', 'shipToCity'] as const;
export type BatchAction = (typeof BATCH_ACTIONS)[number];

export const BATCH_ACTION_FROM: Record<BatchAction, readonly CardBatchStatus[]> = {
  sendToVendor: ['EXPORTED'],
  receiveAtHq: ['SENT_TO_VENDOR'],
  shipToCity: ['RECEIVED_HQ', 'ENCODING'],
};

/** The one manual step that comes next for a batch, if any. */
export function nextBatchAction(status: CardBatchStatus): BatchAction | null {
  return BATCH_ACTIONS.find((a) => BATCH_ACTION_FROM[a].includes(status)) ?? null;
}

/** Most to least relevant: which card the member sees when they have several (history). */
export const CARD_DISPLAY_PRIORITY: readonly CardStatus[] = ['DELIVERED', 'ENCODED', 'RECEIVED_HQ', 'SENT_TO_VENDOR', 'IN_BATCH', 'NOT_PRINTED', 'REVOKED'];

/** Batch size limits: one vendor run, rendered in one go. */
export const BATCH_MAX_CARDS = 200;

/** How long a station holds a card it identified before another station may take it. */
export const ENCODE_LEASE_SECONDS = 180;
/** How long an approved re-encode stays usable by the admin who asked for it. */
export const REENCODE_GRANT_HOURS = 24;

// ─── Capabilities ─────────────────────────────────────────────────────────────

/**
 * What a role may do with cards, check-in and crew loyalty work. Endpoints and screens check a capability, never
 * a role, so a future role (the "regional manager", open question S1) can be given the same
 * capabilities without touching the flows.
 */
export const CAPABILITIES = [
  'checkin.scan',
  'card.handover',
  'card.reportLost',
  'card.requestReencode',
  'card.encode',
  'card.decideReencode',
  'reward.validate',
  'city.operations',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  MEMBER: [],
  LOCAL_ADMIN: ['checkin.scan', 'card.handover', 'card.reportLost', 'card.requestReencode', 'reward.validate', 'city.operations'],
  SUPER_ADMIN: ['checkin.scan', 'card.handover', 'card.reportLost', 'card.encode', 'card.decideReencode', 'reward.validate', 'city.operations'],
};

export function capabilitiesOf(role: Role): readonly Capability[] {
  return ROLE_CAPABILITIES[role];
}

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
