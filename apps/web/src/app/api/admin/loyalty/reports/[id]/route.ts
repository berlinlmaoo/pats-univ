import { requireCrew } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { reviewReport } from '@/lib/loyalty/promoter';
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    return ok(
      await reviewReport(
        await requireCrew(req),
        (await ctx.params).id,
        await readJson(req),
      ),
    );
  },
);
