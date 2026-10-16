import { z } from 'zod';
import { requireCrew } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { setPromoter } from '@/lib/loyalty/promoter';
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireCrew(req);
    const input = z.object({ enabled: z.boolean() }).parse(await readJson(req));
    await setPromoter(admin, (await ctx.params).id, input.enabled);
    return ok({ ok: true });
  },
);
