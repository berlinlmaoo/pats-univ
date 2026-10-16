import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { route } from '@/lib/http/respond';
import { storage } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

/** The event flyer. Flyers are promotional, so this is public like the event itself. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const event = await db.event.findUnique({ where: { id: (await params).id }, select: { flyerUrl: true, status: true } });
  if (!event?.flyerUrl || event.status === 'DRAFT') throw new AppError('NOT_FOUND', 404);
  const file = await storage().get(event.flyerUrl);
  if (!file) throw new AppError('NOT_FOUND', 404);
  return new Response(file.body as BodyInit, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'public, max-age=86400, immutable' } });
});
