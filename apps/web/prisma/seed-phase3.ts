/** Optional Phase 3 showcase data. Re-running keeps catalogue edits and never credits XP twice. */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  await db.reward.upsert({
    where: { id: 'phase3-cocktail' },
    create: {
      id: 'phase3-cocktail',
      name: 'Cocktail',
      description: 'PATS cocktail',
      type: 'DIRECT',
      xpCost: 100,
      stock: 100,
    },
    update: {},
  });
  for (const [i, name] of [
    'Cocktail',
    'Mocktail',
    'Soft drink',
    'PATS sticker',
    'Coffee',
    'PATS pin',
  ].entries()) {
    await db.reward.upsert({
      where: { id: `phase3-spin-${i}` },
      create: {
        id: `phase3-spin-${i}`,
        name,
        type: 'SPIN_PRIZE',
        xpCost: 0,
        spinWeight: 1,
        stock: 100,
      },
      update: {},
    });
  }
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
