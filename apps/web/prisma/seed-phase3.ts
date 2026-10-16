/** Optional Phase 3 showcase data. Re-running keeps catalogue edits and never credits XP twice. */
import 'dotenv/config';
import { addMonths } from '@pats/shared';
import { getSetting } from '../src/lib/settings';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_MODE === 'production') throw new Error('Demo seed is disabled in production');
  const venue = await db.venue.findFirst({ where: { city: { code: 'JKT' } } });
  if (!venue) throw new Error('Run the base demo seed first');
  await db.reward.upsert({
    where: { id: 'phase3-cocktail' },
    create: {
      id: 'phase3-cocktail',
      cityId: venue.cityId,
      venueId: venue.id,
      name: 'Cocktail',
      description: 'PATS cocktail',
      type: 'DIRECT',
      xpCost: 100,
      stock: 100,
    },
    update: { cityId: venue.cityId, venueId: venue.id, active: true },
  });
  const member = await db.member.findFirst({
    where: { user: { email: 'rara.anindya@patsuniv.test' } },
  });
  if (member) {
    await db.member.update({
      where: { id: member.id },
      data: {
        isPromoter: true,
        promoterSince: member.promoterSince ?? new Date(),
      },
    });
    await db.xpLedger.upsert({
      where: { id: 'phase3-demo-xp' },
      create: {
        id: 'phase3-demo-xp',
        memberId: member.id,
        delta: 3800,
        reason: 'ADJUST',
        expiresAt: addMonths(new Date(), await getSetting(db, 'xpExpiryMonths')),
        refType: 'Showcase',
        refId: 'phase3',
      },
      update: {},
    });
  }
  console.log('Phase 3 catalogue ready. Demo member: Rara Anindya.');
}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
