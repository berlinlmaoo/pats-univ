import { requireCrew } from '@/lib/auth/roles';
import { submissionPoster } from '@/lib/events/content';
import { route } from '@/lib/http/respond';

/** The proposed (not yet public) poster of a submission: HQ and the event city's staff only. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const file = await submissionPoster(await requireCrew(req), (await params).id);
  return new Response(file.body as BodyInit, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=300' } });
});
