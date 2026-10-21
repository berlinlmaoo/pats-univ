import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { eventInclude } from '@/lib/events/service';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { hit } from '@/lib/rate-limit';
import { memberEventDetail } from '@/lib/ux/member';
import { submitPosterProof } from '@/lib/ux/poster-proof';

/**
 * Blast poster proof (22 Oct): multipart/form-data { eventId, image } (JPG/PNG/WebP ≤ 5 MB).
 * Creates the member's one proof for the event, or replaces a pending/rejected one (→ PENDING).
 * Returns { proof, ...event detail with the refreshed journey }.
 */
export const POST = route(async (req: Request) => {
  const { member } = await requireMember(req);
  const limit = hit(`poster-proof:${member.id}`, 10, 60_000);
  if (!limit.ok) throw new AppError('RATE_LIMITED', 429, undefined, { retryAfter: limit.retryAfter });
  const form = await req.formData().catch(() => {
    throw new AppError('VALIDATION', 400, 'Body must be multipart form data');
  });
  const eventId = String(form.get('eventId') ?? '');
  const image = form.get('image');
  const proof = await submitPosterProof(member, eventId, image instanceof File ? image : null);
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: eventInclude });
  return ok({ proof, ...(await memberEventDetail(member, event)) }, { status: 201 });
});
