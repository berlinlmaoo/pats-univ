import { db } from '@/lib/db';

/** Liveness + database reachability for the reverse proxy and deploy checks. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
