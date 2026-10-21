import 'server-only';
import { capabilitiesOf, CARD_DISPLAY_PRIORITY, type MeResponse } from '@pats/shared';
import { db } from './db';
import { photoReadUrl } from './members/photo';
import { adminScope } from './ux/staff';

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
    CARD_DISPLAY_PRIORITY.find((s) => m?.cards.some((c) => c.status === s)) ?? 'NOT_PRINTED';
  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      // Preserve the legacy wire role for installed tester builds; capabilities are authoritative.
      role: user.role === 'REGIONAL_ADMIN' ? 'LOCAL_ADMIN' : user.role,
      locale: user.locale,
      city: user.city ?? m?.city ?? null,
      capabilities: [...capabilitiesOf(user.role)],
      adminScope: await adminScope(user),
      membership: m ? 'member' : 'staffOnly',
    },
    member: m
      ? {
          id: m.id,
          nim: m.nim,
          fullName: m.fullName,
          city: m.city,
          favoriteSong: m.favoriteSong,
          favoriteGenre: m.favoriteGenre,
          favoriteDrink: m.favoriteDrink,
          quotes: m.quotes,
          photoUrl: photoReadUrl(m.photoUrl, 3600, true),
          isPromoter: m.isPromoter,
          status: m.status,
          joinedAt: m.joinedAt.toISOString(),
          cardStatus,
        }
      : null,
  };
}
