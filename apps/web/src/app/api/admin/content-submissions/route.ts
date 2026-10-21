import type { ContentSubmissionStatus } from '@pats/shared';
import { requireCrew } from '@/lib/auth/roles';
import { contentQueue } from '@/lib/events/content';
import { ok, route } from '@/lib/http/respond';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ALL'] as const;

/** HQ approval queue for regional posters/descriptions (D5). `?status=` defaults to PENDING. */
export const GET = route(async (req: Request) => {
  const raw = new URL(req.url).searchParams.get('status') ?? 'PENDING';
  const status = (STATUSES as readonly string[]).includes(raw) ? (raw as ContentSubmissionStatus | 'ALL') : 'PENDING';
  return ok({ submissions: await contentQueue(await requireCrew(req), status) });
});
