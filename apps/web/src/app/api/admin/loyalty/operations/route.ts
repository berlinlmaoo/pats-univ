import { requireCrew } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { operations } from '@/lib/loyalty/operations';
import { periodFilters } from '@/lib/loyalty/filters';
export const GET = route(async (req: Request) =>
  ok(
    await operations(
      await requireCrew(req),
      periodFilters(new URL(req.url).searchParams),
    ),
  ),
);
