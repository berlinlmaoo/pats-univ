import 'server-only';
import { countSold, emptySold, layoutSchema, type ReservationPayment, type ReservationsSold, type SlotKind } from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { db } from '../db';
import { posterUrlOf } from '../events/content';

/** Deposit (DP) state of a reservation (PRODUCT.md §4.4: an unpaid live booking blocks new ones). */
export function paymentOf(r: {
  status: string;
  downPaymentAmount: number | null;
  downPaymentAt: Date | null;
  downPaymentBy?: { name: string } | null;
}): ReservationPayment {
  const paid = Boolean(r.downPaymentAt);
  return {
    paid,
    amount: r.downPaymentAmount,
    paidAt: r.downPaymentAt?.toISOString() ?? null,
    recordedBy: r.downPaymentBy?.name ?? null,
    blocksNewBookings: !paid && (r.status === 'PENDING' || r.status === 'CONFIRMED'),
  };
}

export function slotKindOf(layout: unknown, slotCode: string): SlotKind {
  const parsed = layoutSchema.safeParse(layout);
  const slot = parsed.success ? parsed.data.slots.find((s) => s.code === slotCode) : undefined;
  return slot?.kind ?? 'OTHER';
}

/** Confirmed reservations per event, split table / sofa by the venue floor plan (D6 recap). */
export async function soldByEvent(eventIds: string[]): Promise<Map<string, ReservationsSold>> {
  const out = new Map<string, ReservationsSold>(eventIds.map((id) => [id, emptySold()]));
  if (!eventIds.length) return out;
  const rows = await db.reservation.findMany({
    where: { eventId: { in: eventIds }, status: 'CONFIRMED' },
    select: { eventId: true, slotCode: true, pax: true, venue: { select: { layout: true } } },
  });
  const byEvent = new Map<string, typeof rows>();
  for (const r of rows) byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
  for (const [eventId, list] of byEvent) {
    const layout = layoutSchema.safeParse(list[0]!.venue.layout);
    out.set(eventId, countSold(list, layout.success ? layout.data.slots : []));
  }
  return out;
}

export const reservationCardInclude = {
  member: { select: { id: true, fullName: true, nim: true } },
  event: { select: { id: true, title: true, cityId: true, description: true, flyerUrl: true, updatedAt: true, startsAt: true, endsAt: true, city: { select: { id: true, name: true, timezone: true } } } },
  venue: { select: { id: true, name: true, layout: true } },
  conversation: { select: { id: true } },
} satisfies Prisma.ReservationInclude;

export type ReservationCardRow = Prisma.ReservationGetPayload<{ include: typeof reservationCardInclude }>;

/**
 * One reservation card for members and crew alike: status, slot (kind), deposit, conversation and
 * the event poster highlight (tap → full poster + description).
 */
export async function toReservationCard(r: ReservationCardRow, recorders?: Map<string, string>) {
  return {
    id: r.id,
    status: r.status,
    slotCode: r.slotCode,
    slotKind: slotKindOf(r.venue.layout, r.slotCode),
    pax: r.pax,
    minimumCharge: r.minimumCharge,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    conversationId: r.conversation?.id ?? null,
    member: { id: r.member.id, fullName: r.member.fullName, nim: r.member.nim },
    venue: { id: r.venue.id, name: r.venue.name },
    event: {
      id: r.event.id,
      title: r.event.title,
      city: { id: r.event.city.id, name: r.event.city.name, timezone: r.event.city.timezone },
      startsAt: r.event.startsAt.toISOString(),
      endsAt: r.event.endsAt.toISOString(),
      poster: { url: posterUrlOf(r.event), description: r.event.description },
    },
    payment: paymentOf({ ...r, downPaymentBy: r.downPaymentById ? { name: recorders?.get(r.downPaymentById) ?? '' } : null }),
  };
}

export type ReservationCard = Awaited<ReturnType<typeof toReservationCard>>;

/** Names of the admins who recorded deposits, for "recorded by". */
export async function recorderNames(rows: { downPaymentById: string | null }[]) {
  const ids = [...new Set(rows.flatMap((r) => (r.downPaymentById ? [r.downPaymentById] : [])))];
  if (!ids.length) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function reservationCards(where: Prisma.ReservationWhereInput, take = 100): Promise<ReservationCard[]> {
  const rows = await db.reservation.findMany({ where, include: reservationCardInclude, orderBy: { createdAt: 'desc' }, take });
  const names = await recorderNames(rows);
  return Promise.all(rows.map((r) => toReservationCard(r, names)));
}
