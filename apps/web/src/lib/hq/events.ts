'use server';

import { eventInputSchema, fieldErrors, type EventAction } from '@pats/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createEvent, transitionEvent, updateEvent } from '../events/service';
import { AppError, ERROR_MESSAGE_KEY } from '../http/errors';
import type { ActionResult } from './action-result';
import { requireDashboard } from './guard';

function failure(err: unknown): ActionResult {
  if (err instanceof AppError) {
    return err.extra.fields ? { ok: false, fields: err.extra.fields } : { ok: false, message: ERROR_MESSAGE_KEY[err.code] };
  }
  throw err;
}

/** Create (eventId null, then go to the new event) or edit an event from the dashboard. */
export async function saveEventAction(eventId: string | null, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hq = await requireDashboard();
  const raw = Object.fromEntries(form);
  const parsed = eventInputSchema.safeParse({ ...raw, publish: form.has('publish') });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  let id: string;
  try {
    id = eventId ? (await updateEvent(hq, eventId, parsed.data)).id : (await createEvent(hq, parsed.data)).id;
  } catch (err) {
    return failure(err);
  }
  revalidatePath('/events');
  revalidatePath(`/events/${id}`);
  if (!eventId) redirect(`/events/${id}`);
  return { ok: true, message: 'events.updated' };
}

const DONE: Record<EventAction, string> = { publish: 'events.published', open: 'events.opened', close: 'events.closed' };

export async function eventTransitionAction(eventId: string, action: EventAction): Promise<ActionResult> {
  const hq = await requireDashboard();
  try {
    await transitionEvent(hq, eventId, action);
  } catch (err) {
    return failure(err);
  }
  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`);
  return { ok: true, message: DONE[action] };
}
