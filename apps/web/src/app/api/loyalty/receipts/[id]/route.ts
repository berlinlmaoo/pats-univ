import { requireApiUser, requireCityAccess } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import { receiptStorage } from '@/lib/loyalty/storage/receipts';
export const GET = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireApiUser(req);
    const report = await db.promoterReport.findUnique({
      where: { id: (await ctx.params).id },
      include: { member: { select: { userId: true } } },
    });
    if (!report) throw new AppError('NOT_FOUND', 404);
    if (report.member.userId !== user.id)
      requireCityAccess(user, report.cityId);
    const url = await receiptStorage.getSignedUrl(report.receiptUrl, {
      operation: 'read',
      expiresInSeconds: 120,
    });
    return new URL(req.url).searchParams.get('format') === 'json'
      ? ok({ url }, { headers: { 'Cache-Control': 'private, no-store' } })
      : new Response(null, {
          status: 302,
          headers: {
            Location: url,
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
          },
        });
  },
);
