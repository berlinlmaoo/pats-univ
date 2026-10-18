import { route } from '@/lib/http/respond';
import { readPhoto, verifyPhotoUrl } from '@/lib/members/photo';

/** Serves a member photo for a valid, unexpired signed URL (lib/members/photo.ts). */
export const GET = route(async (req: Request) => {
  const { body, contentType } = await readPhoto(verifyPhotoUrl(req));
  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
