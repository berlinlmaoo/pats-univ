'use server';

import { revalidatePath } from 'next/cache';
import { decideContent, saveEventContent } from '../events/content';
import { AppError, ERROR_MESSAGE_KEY } from '../http/errors';
import type { ActionResult } from './action-result';
import { requireDashboard } from './guard';

function failure(err: unknown): ActionResult {
  if (err instanceof AppError) {
    return err.extra.fields ? { ok: false, fields: err.extra.fields, message: Object.values(err.extra.fields)[0] } : { ok: false, message: ERROR_MESSAGE_KEY[err.code] };
  }
  throw err;
}

/** Poster + description from the dashboard: HQ saves directly, a regional admin sends it to HQ. */
export async function saveEventContentAction(eventId: string, form: FormData): Promise<ActionResult> {
  const user = await requireDashboard();
  const poster = form.get('poster');
  const description = form.get('description');
  try {
    const res = await saveEventContent(user, eventId, {
      description: typeof description === 'string' ? description : undefined,
      poster: poster instanceof File && poster.size > 0 ? poster : null,
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath('/regional');
    return { ok: true, message: res.mode === 'direct' ? 'ux.content.saved' : 'ux.content.submitted' };
  } catch (err) {
    return failure(err);
  }
}

/** HQ decides a regional submission; approval puts it live for members. */
export async function decideContentAction(submissionId: string, decision: 'APPROVED' | 'REJECTED', note: string): Promise<ActionResult> {
  const user = await requireDashboard();
  try {
    const s = await decideContent(user, submissionId, { decision, note });
    revalidatePath(`/events/${s.eventId}`);
    revalidatePath('/regional');
    return { ok: true, message: decision === 'APPROVED' ? 'ux.content.approved' : 'ux.content.rejected' };
  } catch (err) {
    return failure(err);
  }
}
