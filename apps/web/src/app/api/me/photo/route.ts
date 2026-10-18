import { requireMember } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { buildMe } from '@/lib/me';
import { limitedPhotoBody, parsePhotoType, putPhoto } from '@/lib/members/photo';
import { hit } from '@/lib/rate-limit';

/** The member replaces their photo (raw image body, Content-Type image/jpeg|png|webp). */
export const PUT = route(async (req: Request) => {
  const { user, member } = await requireMember(req);
  if (!hit(`member-photo:${user.id}`, 10, 60 * 60 * 1000).ok) throw new AppError('RATE_LIMITED', 429);
  const type = parsePhotoType(req.headers.get('content-type'));
  const key = await putPhoto(member.id, await limitedPhotoBody(req), type);
  await db.member.update({ where: { id: member.id }, data: { photoUrl: key } });
  await db.auditLog.create({ data: { actorId: user.id, action: 'member.photoUpdated', targetType: 'Member', targetId: member.id } });
  return ok(await buildMe(user.id));
});
