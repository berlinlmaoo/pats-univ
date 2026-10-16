import 'server-only';
import type { CardStatus, MeResponse } from '@pats/shared';
import { db } from './db';

/** Statuses ordered from most to least relevant, to pick which card the member sees. */
const CARD_PRIORITY: CardStatus[] = ['DELIVERED', 'ENCODED', 'RECEIVED_HQ', 'SENT_TO_VENDOR', 'IN_BATCH', 'NOT_PRINTED', 'REVOKED'];

export async function buildMe(userId: string): Promise<MeResponse> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      city: { select: { id: true, code: true, name: true } },
      member: {
        include: {
          city: { select: { id: true, code: true, name: true } },
          cards: { select: { status: true } },
        },
      },
    },
  });
  const m = user.member;
  const cardStatus =
    CARD_PRIORITY.find((s) => m?.cards.some((c) => c.status === s)) ?? 'NOT_PRINTED';
  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      locale: user.locale,
      city: user.city ?? m?.city ?? null,
    },
    member: m
      ? {
          id: m.id,
          nim: m.nim,
          fullName: m.fullName,
          city: m.city,
          favoriteSong: m.favoriteSong,
          favoriteGenre: m.favoriteGenre,
          quotes: m.quotes,
          photoUrl: m.photoUrl,
          isPromoter: m.isPromoter,
          status: m.status,
          joinedAt: m.joinedAt.toISOString(),
          cardStatus,
        }
      : null,
  };
}
