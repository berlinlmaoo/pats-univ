import { AppError } from '@/lib/http/errors';
import { clientIp, ok, route } from '@/lib/http/respond';
import { limitedPhotoBody, parsePhotoType, photoReadUrl, putPhoto } from '@/lib/members/photo';
import { hit } from '@/lib/rate-limit';

/**
 * /join photo step: the applicant uploads their photo before the member exists. The body is the
 * raw image (Content-Type image/jpeg|png|webp). Returns a pending key the registration refers to
 * and a short preview URL. Unclaimed pending photos are never shown anywhere.
 */
export const POST = route(async (req: Request) => {
  const limit = hit(`join-photo:${clientIp(req)}`, 20, 60 * 60 * 1000);
  if (!limit.ok) throw new AppError('RATE_LIMITED', 429, 'Too many uploads', { retryAfter: limit.retryAfter, params: { seconds: limit.retryAfter } });
  const type = parsePhotoType(req.headers.get('content-type'));
  const key = await putPhoto('pending', await limitedPhotoBody(req), type);
  return ok({ key, previewUrl: photoReadUrl(key, 1800) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
