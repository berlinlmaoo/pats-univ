import 'server-only';
import {
  can,
  contentDecisionSchema,
  EVENT_DESCRIPTION_MAX,
  type ContentSubmissionInfo,
  type ContentSubmissionStatus,
  type EventContentResponse,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { atomic } from '../loyalty/transaction';
import { notifyUsers } from '../push/notify';
import { publish } from '../social/realtime';
import { storage } from '../storage';

/**
 * Event poster + description (UX redesign D5). HQ edits go live at once; a regional admin's edits
 * wait as a PENDING submission until HQ approves them. Members only ever see Event.description and
 * Event.flyerUrl, so nothing unapproved can reach them.
 */

export const POSTER_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const POSTER_MAX_BYTES = 5 * 1024 * 1024;

const submissionInclude = {
  event: { select: { id: true, title: true, city: { select: { id: true, name: true } } } },
  submittedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
} satisfies Prisma.EventContentSubmissionInclude;

type SubmissionRow = Prisma.EventContentSubmissionGetPayload<{ include: typeof submissionInclude }>;

export function toSubmissionInfo(s: SubmissionRow): ContentSubmissionInfo {
  return {
    id: s.id,
    eventId: s.eventId,
    eventTitle: s.event.title,
    city: s.event.city,
    status: s.status as ContentSubmissionStatus,
    description: s.description,
    posterUrl: s.posterKey ? `/api/admin/content-submissions/${s.id}/poster` : null,
    submittedBy: s.submittedBy.name,
    submittedAt: s.createdAt.toISOString(),
    decidedBy: s.decidedBy?.name ?? null,
    decidedAt: s.decidedAt?.toISOString() ?? null,
    note: s.note,
  };
}

export const posterUrlOf = (e: { id: string; flyerUrl: string | null; updatedAt: Date }) =>
  e.flyerUrl ? `/api/events/${e.id}/flyer?v=${e.updatedAt.getTime()}` : null;

/** Checks an uploaded poster and stores it; returns its storage key. */
export async function storePoster(eventId: string, file: File, folder: 'live' | 'submissions'): Promise<string> {
  const ext = POSTER_TYPES[file.type];
  if (!ext) throw new AppError('VALIDATION', 422, 'Poster type', { fields: { poster: 'validation.flyerType' } });
  if (file.size === 0) throw new AppError('VALIDATION', 422, 'Poster empty', { fields: { poster: 'validation.flyerRequired' } });
  if (file.size > POSTER_MAX_BYTES) throw new AppError('VALIDATION', 422, 'Poster size', { fields: { poster: 'validation.flyerTooLarge' } });
  const key = folder === 'live' ? `events/${eventId}/flyer-${Date.now()}.${ext}` : `events/${eventId}/submissions/poster-${Date.now()}.${ext}`;
  await storage().put(key, new Uint8Array(await file.arrayBuffer()), file.type);
  return key;
}

function cleanDescription(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new AppError('VALIDATION', 422, 'Description', { fields: { description: 'validation.invalid' } });
  const text = raw.trim();
  if (text.length > EVENT_DESCRIPTION_MAX) throw new AppError('VALIDATION', 422, 'Description', { fields: { description: 'validation.tooLong' } });
  return text;
}

async function hqUserIds() {
  return (await db.user.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id);
}

/**
 * A regional admin's change becomes the event's single PENDING submission (an older waiting one is
 * withdrawn in the same transaction). Used by the content endpoint and by event create/update, so
 * a regional edit of the description can never go live without HQ.
 */
export async function submitContent(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  eventId: string,
  change: { description: string | null; posterKey: string | null },
) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
  const withdrawn = await tx.eventContentSubmission.findFirst({ where: { eventId, status: 'PENDING' } });
  if (withdrawn) {
    await tx.eventContentSubmission.update({ where: { id: withdrawn.id }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
  }
  const row = await tx.eventContentSubmission.create({
    data: { eventId, submittedById: actor.id, description: change.description, posterKey: change.posterKey },
    include: submissionInclude,
  });
  await tx.auditLog.create({
    data: { actorId: actor.id, action: 'event.content.submitted', targetType: 'Event', targetId: eventId, meta: { submissionId: row.id, poster: Boolean(change.posterKey), description: change.description !== null, replaced: withdrawn?.id ?? null } },
  });
  return row;
}

export async function notifyContentSubmitted(row: SubmissionRow) {
  await notifyUsers(await hqUserIds(), {
    kind: 'contentSubmitted',
    values: { sender: row.submittedBy.name, event: row.event.title },
    data: { screen: 'content', eventId: row.eventId, submissionId: row.id },
  });
}

/** POST /api/admin/events/:id/content and the dashboard form. */
export async function saveEventContent(
  actor: AuthUser,
  eventId: string,
  input: { description?: unknown; poster?: File | null },
): Promise<{ mode: 'direct' | 'approval'; submission: ContentSubmissionInfo | null }> {
  if (!can(actor.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(actor, event.cityId);
  const description = cleanDescription(input.description);
  const direct = can(actor.role, 'hq.manage');
  const descriptionChanged = description !== null && description !== event.description;
  const poster = input.poster && input.poster.size > 0 ? input.poster : null;
  if (!descriptionChanged && !poster) throw new AppError('VALIDATION', 422, 'No change', { fields: { description: 'ux.content.noChange' } });
  const posterKey = poster ? await storePoster(eventId, poster, direct ? 'live' : 'submissions') : null;

  if (direct) {
    const row = await atomic(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: { ...(descriptionChanged ? { description: description! } : {}), ...(posterKey ? { flyerUrl: posterKey } : {}) },
      });
      const created = await tx.eventContentSubmission.create({
        data: {
          eventId,
          submittedById: actor.id,
          description: descriptionChanged ? description : null,
          posterKey,
          status: 'APPROVED',
          decidedById: actor.id,
          decidedAt: new Date(),
        },
        include: submissionInclude,
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'event.content.saved', targetType: 'Event', targetId: eventId, meta: { poster: Boolean(posterKey), description: descriptionChanged } } });
      return created;
    });
    await publish({ kind: 'attendance', id: eventId });
    return { mode: 'direct', submission: toSubmissionInfo(row) };
  }

  const row = await atomic((tx) => submitContent(tx, actor, eventId, { description: descriptionChanged ? description : null, posterKey }));
  await notifyContentSubmitted(row);
  return { mode: 'approval', submission: toSubmissionInfo(row) };
}

/** HQ approves (the change goes live) or rejects (with a reason the submitter sees). */
export async function decideContent(hq: AuthUser, submissionId: string, raw: unknown): Promise<ContentSubmissionInfo> {
  if (!can(hq.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  const input = contentDecisionSchema.parse(raw);
  const row = await atomic(async (tx) => {
    const s = await tx.eventContentSubmission.findUnique({ where: { id: submissionId } });
    if (!s) throw new AppError('NOT_FOUND', 404);
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${s.eventId} FOR UPDATE`;
    const claimed = await tx.eventContentSubmission.updateMany({
      where: { id: s.id, status: 'PENDING' },
      data: { status: input.decision, decidedById: hq.id, decidedAt: new Date(), note: input.note || null },
    });
    if (!claimed.count) throw new AppError('REQUEST_DECIDED', 409);
    if (input.decision === 'APPROVED') {
      await tx.event.update({
        where: { id: s.eventId },
        data: { ...(s.description !== null ? { description: s.description } : {}), ...(s.posterKey ? { flyerUrl: s.posterKey } : {}) },
      });
    }
    await tx.auditLog.create({ data: { actorId: hq.id, action: 'event.content.decided', targetType: 'EventContentSubmission', targetId: s.id, meta: { decision: input.decision, note: input.note, eventId: s.eventId } } });
    return tx.eventContentSubmission.findUniqueOrThrow({ where: { id: s.id }, include: submissionInclude });
  });
  await publish({ kind: 'attendance', id: row.eventId });
  await notifyUsers([row.submittedById], {
    kind: 'contentDecided',
    values: {
      event: row.event.title,
      status: (locale) =>
        input.decision === 'APPROVED'
          ? locale === 'id' ? 'disetujui, sudah tayang' : 'approved, now live'
          : locale === 'id' ? `ditolak (${input.note})` : `rejected (${input.note})`,
    },
    data: { screen: 'eventContent', eventId: row.eventId, submissionId: row.id },
  });
  return toSubmissionInfo(row);
}

/** What members see now, how this user's edits apply, and the pending + recent submissions. */
export async function eventContent(user: AuthUser, eventId: string): Promise<EventContentResponse> {
  if (!can(user.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(user, event.cityId);
  const rows = await db.eventContentSubmission.findMany({ where: { eventId }, include: submissionInclude, orderBy: { createdAt: 'desc' }, take: 20 });
  const pending = rows.find((r) => r.status === 'PENDING');
  return {
    live: { url: posterUrlOf(event), description: event.description },
    mode: can(user.role, 'hq.manage') ? 'direct' : 'approval',
    pending: pending ? toSubmissionInfo(pending) : null,
    history: rows.filter((r) => r.status !== 'PENDING').map(toSubmissionInfo),
  };
}

/** HQ queue (default: waiting ones, oldest first). */
export async function contentQueue(hq: AuthUser, status: ContentSubmissionStatus | 'ALL' = 'PENDING'): Promise<ContentSubmissionInfo[]> {
  if (!can(hq.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  const rows = await db.eventContentSubmission.findMany({
    where: status === 'ALL' ? {} : { status },
    include: submissionInclude,
    orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 100,
  });
  return rows.map(toSubmissionInfo);
}

/** The proposed poster of a submission: staff of that city and HQ only (it isn't public yet). */
export async function submissionPoster(user: AuthUser, submissionId: string) {
  if (!can(user.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  const s = await db.eventContentSubmission.findUnique({ where: { id: submissionId }, include: { event: { select: { cityId: true } } } });
  if (!s?.posterKey) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(user, s.event.cityId);
  const file = await storage().get(s.posterKey);
  if (!file) throw new AppError('NOT_FOUND', 404);
  return file;
}
