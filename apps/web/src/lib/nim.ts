import { formatNim, NIM_MAX_SEQUENCE, zonedParts } from '@pats/shared';
import type { Prisma } from '@/generated/prisma';

/**
 * Reserves the next NIM for `city`. Must run inside the registration transaction: the counter
 * row is incremented with a single upsert, so concurrent registrations never share a number.
 */
export async function allocateNim(
  tx: Prisma.TransactionClient,
  city: { id: string; code: string; timezone: string },
  at: Date = new Date(),
): Promise<string> {
  const year = zonedParts(at, city.timezone).year;
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "NimSequence" ("cityId", "year", "lastValue")
    VALUES (${city.id}, ${year}, 1)
    ON CONFLICT ("cityId", "year") DO UPDATE SET "lastValue" = "NimSequence"."lastValue" + 1
    RETURNING "lastValue"`;
  const sequence = Number(rows[0]?.lastValue);
  if (!sequence || sequence > NIM_MAX_SEQUENCE) {
    throw new Error(`NIM sequence exhausted for ${city.code} ${year}`);
  }
  return formatNim(city.code, year, sequence);
}
