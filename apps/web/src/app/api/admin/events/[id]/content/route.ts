import { requireCrew } from '@/lib/auth/roles';
import { eventContent, saveEventContent } from '@/lib/events/content';
import { AppError } from '@/lib/http/errors';
import { ok, readJson, route } from '@/lib/http/respond';

type Ctx = { params: Promise<{ id: string }> };

/** Poster + description (D5): what members see, the pending submission and recent history. */
export const GET = route(async (req: Request, { params }: Ctx) => ok(await eventContent(await requireCrew(req), (await params).id)));

/**
 * multipart/form-data { description?, poster? (JPG/PNG/WebP ≤ 5 MB) } or JSON { description }.
 * HQ: applied at once (mode "direct"). Regional admin: a PENDING submission for HQ (mode "approval");
 * it replaces the event's earlier waiting submission.
 */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const admin = await requireCrew(req);
  const id = (await params).id;
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => {
      throw new AppError('VALIDATION', 400, 'Body must be multipart form data');
    });
    const poster = form.get('poster');
    const description = form.get('description');
    return ok(
      await saveEventContent(admin, id, {
        description: typeof description === 'string' ? description : undefined,
        poster: poster instanceof File ? poster : null,
      }),
    );
  }
  const body = (await readJson(req)) as { description?: unknown };
  return ok(await saveEventContent(admin, id, { description: body?.description }));
});
