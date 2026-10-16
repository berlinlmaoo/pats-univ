import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  try {
    const cities = await db.city.findMany();
    for (const city of cities) {
      for (const kind of ["TIMELINE", "CHAT"] as const)
        await db.channel.upsert({
          where: { id: `phase4-${city.code}-${kind}` },
          create: {
            id: `phase4-${city.code}-${kind}`,
            cityId: city.id,
            kind,
            name: kind === "CHAT" ? "Obrolan kota" : "Kabar kota",
          },
          update: {},
        });
    }
    const venues = await db.venue.findMany({
      where: { layout: { equals: Prisma.DbNull } },
    });
    for (const venue of venues)
      await db.venue.update({
        where: { id: venue.id },
        data: {
          layout: {
            slots: [
              { code: "S1", kind: "SOFA", x: 0, y: 0, w: 4, h: 3, pax: 6 },
              { code: "S2", kind: "SOFA", x: 7, y: 0, w: 4, h: 3, pax: 6 },
              { code: "T1", kind: "TABLE", x: 4, y: 7, w: 3, h: 3, pax: 4 },
            ],
          },
        },
      });
    console.log("Phase 4 channels and floor plans ready.");
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
