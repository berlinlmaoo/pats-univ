/**
 * Prisma "unique constraint failed". Matched on the stable error code, not `instanceof`: bundlers
 * can load the Prisma runtime twice (dev server after a production build, for one), and an
 * instanceof check against the other copy silently fails.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
