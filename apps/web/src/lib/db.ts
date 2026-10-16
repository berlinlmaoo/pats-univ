import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '@/generated/prisma';

const globalForDb = globalThis as unknown as { __patsPrisma?: PrismaClient; __patsPool?: pg.Pool };

function pool(): pg.Pool {
  if (globalForDb.__patsPool) return globalForDb.__patsPool;
  const p = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    application_name: 'pats-web',
  });
  // A dropped idle connection (Postgres restart) must not crash the process.
  p.on('error', (err) => console.warn('[db] idle connection error', String(err)));
  globalForDb.__patsPool = p;
  return p;
}

/** One client and one pool per process (dev hot reload reuses them). */
export const db: PrismaClient = globalForDb.__patsPrisma ?? new PrismaClient({ adapter: new PrismaPg(pool()) });
if (process.env.NODE_ENV !== 'production') globalForDb.__patsPrisma = db;
