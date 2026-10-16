'use server';

import { broadcastSchema, createBatchSchema, fieldErrors, notificationCopySchema, reencodeDecisionSchema, revokeCardSchema, type BatchAction } from '@pats/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { batchFolder, generateBatchFiles } from '../card-print/generate';
import { Prisma } from '@/generated/prisma';
import { decideReencode } from '../cards/crew';
import { batchAction, cancelBatch, createBatch, revokeCard } from '../cards/service';
import { db } from '../db';
import { AppError, ERROR_MESSAGE_KEY } from '../http/errors';
import { broadcastEvent } from '../push/broadcast';
import { storage } from '../storage';
import type { ActionResult } from './action-result';
import { requireHq } from './guard';

function failure(err: unknown): ActionResult {
  if (err instanceof AppError) {
    return err.extra.fields ? { ok: false, fields: err.extra.fields } : { ok: false, message: ERROR_MESSAGE_KEY[err.code], params: err.extra.params };
  }
  throw err;
}

const refreshCards = (batchId?: string) => {
  revalidatePath('/cards', 'layout');
  if (batchId) revalidatePath(`/cards/batches/${batchId}`);
  revalidatePath('/overview');
};

/** Queue → batch: cards get tokens (IN_BATCH) and the print files are rendered right away. */
export async function createBatchAction(input: { cityId: string; cardIds: string[] }): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return { ok: false, message: fields.cardIds ?? fields.cityId ?? 'validation.invalid' };
  }
  let id: string;
  try {
    id = (await createBatch(hq, parsed.data)).id;
  } catch (err) {
    return failure(err);
  }
  await generateBatchFiles(id);
  refreshCards(id);
  redirect(`/cards/batches/${id}`);
}

const DONE: Record<BatchAction, string> = {
  sendToVendor: 'cards.sentToVendor',
  receiveAtHq: 'cards.receivedAtHq',
  shipToCity: 'cards.shipped',
};

export async function batchActionAction(batchId: string, action: BatchAction): Promise<ActionResult> {
  const hq = await requireHq();
  try {
    await batchAction(hq, batchId, action);
  } catch (err) {
    return failure(err);
  }
  refreshCards(batchId);
  return { ok: true, message: DONE[action] };
}

export async function regenerateFilesAction(batchId: string): Promise<ActionResult> {
  const hq = await requireHq();
  const res = await generateBatchFiles(batchId);
  await db.auditLog.create({ data: { actorId: hq.id, action: 'batch.files', targetType: 'CardBatch', targetId: batchId, meta: { ok: res.ok } } });
  refreshCards(batchId);
  return res.ok ? { ok: true, message: 'cards.filesReady' } : { ok: false, message: 'errors.filesFailed' };
}

export async function cancelBatchAction(batchId: string): Promise<ActionResult> {
  const hq = await requireHq();
  try {
    await cancelBatch(hq, batchId);
  } catch (err) {
    return failure(err);
  }
  // Files of a cancelled batch go too; the cards' tokens were never printed.
  await storage().removePrefix(batchFolder(batchId)).catch((err) => console.warn('[cards] cleanup failed', batchId, String(err)));
  refreshCards();
  redirect('/cards?tab=batches');
}

export async function saveVendorNoteAction(batchId: string, note: string): Promise<ActionResult> {
  await requireHq();
  await db.cardBatch.update({ where: { id: batchId }, data: { vendorNote: note.trim().slice(0, 500) || null } });
  refreshCards(batchId);
  return { ok: true, message: 'common.saved' };
}

export async function revokeCardAction(cardId: string, reason: string): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = revokeCardSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  try {
    await revokeCard(hq, cardId, parsed.data.reason);
  } catch (err) {
    return failure(err);
  }
  const card = await db.card.findUnique({ where: { id: cardId }, select: { memberId: true, batchId: true } });
  refreshCards(card?.batchId ?? undefined);
  if (card) revalidatePath(`/members/${card.memberId}`);
  return { ok: true, message: 'cards.revoked' };
}

export async function decideReencodeAction(requestId: string, approve: boolean, note?: string): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = reencodeDecisionSchema.safeParse({ approve, note });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  try {
    await decideReencode(hq, requestId, parsed.data.approve, parsed.data.note);
  } catch (err) {
    return failure(err);
  }
  refreshCards();
  return { ok: true, message: approve ? 'cards.reencodeApproved' : 'cards.reencodeRejected' };
}

/** Event broadcast (PRODUCT.md §5.3): push to every member of the chosen cities. */
export async function broadcastAction(eventId: string, cityIds: string[]): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = broadcastSchema.safeParse({ cityIds });
  if (!parsed.success) return { ok: false, message: 'validation.citiesRequired' };
  try {
    const res = await broadcastEvent(hq, eventId, parsed.data.cityIds);
    revalidatePath(`/events/${eventId}`);
    return { ok: true, message: 'events.broadcastSent', params: { count: res.recipients } } as ActionResult;
  } catch (err) {
    return failure(err);
  }
}

/** Per-city push copy overrides (City.notificationCopy). Empty fields fall back to the defaults. */
export async function saveCityCopyAction(cityId: string, copy: unknown): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = notificationCopySchema.safeParse(copy);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const cleaned = Object.fromEntries(
    Object.entries(parsed.data)
      .map(([kind, v]) => [kind, Object.fromEntries(Object.entries(v ?? {}).filter(([, text]) => text && text.trim()))])
      .filter(([, v]) => Object.keys(v as object).length > 0),
  );
  await db.city.update({ where: { id: cityId }, data: { notificationCopy: Object.keys(cleaned).length ? cleaned : Prisma.DbNull } });
  await db.auditLog.create({ data: { actorId: hq.id, action: 'city.notification_copy', targetType: 'City', targetId: cityId, meta: { kinds: Object.keys(cleaned) } } });
  revalidatePath('/cities');
  return { ok: true, message: 'cities.copySaved' };
}

const FLYER_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FLYER_MAX_BYTES = 5 * 1024 * 1024;

/** Upload or replace an event's flyer (JPG, PNG or WebP, up to 5 MB). */
export async function uploadFlyerAction(eventId: string, form: FormData): Promise<ActionResult> {
  const hq = await requireHq();
  const file = form.get('flyer');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'validation.flyerRequired' };
  const ext = FLYER_TYPES[file.type];
  if (!ext) return { ok: false, message: 'validation.flyerType' };
  if (file.size > FLYER_MAX_BYTES) return { ok: false, message: 'validation.flyerTooLarge' };
  const event = await db.event.findUnique({ where: { id: eventId }, select: { flyerUrl: true } });
  if (!event) return { ok: false, message: 'errors.notFound' };
  const key = `events/${eventId}/flyer-${Date.now()}.${ext}`;
  await storage().put(key, new Uint8Array(await file.arrayBuffer()), file.type);
  await db.event.update({ where: { id: eventId }, data: { flyerUrl: key } });
  if (event.flyerUrl) await storage().remove(event.flyerUrl).catch(() => undefined);
  await db.auditLog.create({ data: { actorId: hq.id, action: 'event.flyer', targetType: 'Event', targetId: eventId } });
  revalidatePath(`/events/${eventId}`);
  return { ok: true, message: 'events.flyerSaved' };
}
