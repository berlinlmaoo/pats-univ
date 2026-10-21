import { requireApiUser } from '@/lib/auth/current-user';
import { route } from '@/lib/http/respond';
import { proofImage } from '@/lib/ux/poster-proof';

/** A poster-proof screenshot: its owner, crew of the event city, or HQ. Never public. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const file = await proofImage(await requireApiUser(req), (await params).id);
  return new Response(file.body as BodyInit, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=300' } });
});
