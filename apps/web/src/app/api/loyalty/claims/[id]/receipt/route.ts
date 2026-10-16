import { can } from '@pats/shared';
import { requireApiUser, requireCityAccess } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { signReceiptUrl } from '@/lib/loyalty/receipts';
export const GET = route(async (req: Request, context: { params: Promise<{ id: string }> }) => {
 const user = await requireApiUser(req);
 const claim = await db.xpClaim.findUnique({ where: { id: (await context.params).id }, include: { member: true, event: true } });
 if (!claim?.receiptUrl) throw new AppError('NOT_FOUND', 404);
 if (claim.member.userId !== user.id) { if (!can(user.role, 'promoter.manage')) throw new AppError('FORBIDDEN', 403); requireCityAccess(user, claim.event.cityId); }
 const url = await signReceiptUrl(claim.receiptUrl, { operation: 'read', expiresInSeconds: 300 });
 return new URL(req.url).searchParams.get('format') === 'json' ? ok({ url }) : Response.redirect(url);
});
