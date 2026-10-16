import { z } from 'zod';
import { requireMember } from '@/lib/auth/roles';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';
import { newReceiptKey, signReceiptUrl } from '@/lib/loyalty/receipts';
import { hit } from '@/lib/rate-limit';
export const POST = route(async (req: Request) => {
  const { user, member } = await requireMember(req);
  const input = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).parse(await readJson(req));
  if (!hit(`receipt:${user.id}`, 30, 60_000).ok) throw new AppError('RATE_LIMITED', 429);
  const key = newReceiptKey(member.id, input.contentType);
  return ok({
    key,
    uploadUrl: await signReceiptUrl(key, {
      operation: 'write',
      expiresInSeconds: 300,
      contentType: input.contentType,
    }),
  });
});
