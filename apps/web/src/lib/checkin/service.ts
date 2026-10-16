import 'server-only';
import {
  CHECK_IN_METHODS,
  eventPhase,
  type AttendanceEntry,
  type AttendanceResponse,
  type CheckInMethod,
  type CheckInPreviewResponse,
  type CheckInResponse,
  type ManualSearchResponse,
  type ScanMember,
} from '@pats/shared';
import type { z } from 'zod';
import type { checkInCommitSchema, checkInPreviewSchema } from '@pats/shared';
import { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { env } from '../env';
import { AppError } from '../http/errors';
import { getSetting } from '../settings';
import { newNonce, signQr, signTicket, verifyQr, verifyTicket } from './token';

/** How long the crew has to confirm after a scan. */
export const TICKET_TTL_SECONDS = 120;

const key = () => env().AUTH_SECRET;

// ─── Member side ──────────────────────────────────────────────────────────────

/** A fresh rotating QR for an active member. */
export async function issueCardToken(memberId: string, now = new Date()) {
  const ttlSeconds = await getSetting(db, 'appQrTtlSeconds');
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  // Housekeeping: nonces of QRs that have expired can never be presented again.
  if (Math.random() < 0.02) await db.usedNonce.deleteMany({ where: { expiresAt: { lt: now } } });
  return {
    token: signQr(key(), { memberId, nonce: newNonce(), expiresAt }),
    expiresAt: expiresAt.toISOString(),
    ttlSeconds,
    serverTime: now.toISOString(),
  };
}

// ─── Crew side ────────────────────────────────────────────────────────────────

const memberSelect = {
  id: true,
  nim: true,
  fullName: true,
  photoUrl: true,
  status: true,
  cityId: true,
  city: { select: { id: true, code: true, name: true } },
  user: { select: { status: true } },
} satisfies Prisma.MemberSelect;

type ScannedMember = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

function toScanMember(m: ScannedMember): ScanMember {
  const inactive = m.status !== 'ACTIVE' || m.user.status !== 'ACTIVE';
  return { id: m.id, nim: m.nim, fullName: m.fullName, photoUrl: m.photoUrl, city: m.city, status: inactive ? 'INACTIVE' : 'ACTIVE' };
}

/** The event, if this admin may scan for it and check-in is open right now. */
async function openEventFor(admin: AuthUser, eventId: string, now: Date) {
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(admin, event.cityId);
  const phase = eventPhase(event, now);
  if (phase === 'ended') throw new AppError('EVENT_ENDED', 409);
  if (phase !== 'open') throw new AppError('EVENT_NOT_OPEN', 409);
  return event;
}

/** Approved attendance roaming for a member from another city (PRODUCT.md §6.1.5). */
async function roamingFor(memberId: string, eventId: string) {
  return db.roamingRequest.findFirst({
    where: { memberId, eventId, type: 'ATTENDANCE', status: 'APPROVED' },
    select: { id: true },
  });
}

type PreviewInput = z.output<typeof checkInPreviewSchema>;
type CommitInput = z.output<typeof checkInCommitSchema>;

/**
 * Step 1 of a scan: identify the member and say whether they can be checked in. Nothing is
 * recorded. Hard failures (bad QR, closed event, wrong city admin) are errors; problems with an
 * identified member come back as `issue` so the crew sees who it is.
 */
export async function previewCheckIn(admin: AuthUser, input: PreviewInput, now = new Date()): Promise<CheckInPreviewResponse> {
  const event = await openEventFor(admin, input.eventId, now);

  let memberId: string;
  let nonce: string | null = null;
  if (input.method === 'APP_QR') {
    const qr = verifyQr(key(), input.token, now);
    if (!qr.ok) throw new AppError(qr.reason === 'expired' ? 'QR_EXPIRED' : 'QR_INVALID', qr.reason === 'expired' ? 410 : 422);
    if (await db.usedNonce.findUnique({ where: { nonce: qr.claims.nonce } })) throw new AppError('QR_USED', 409);
    memberId = qr.claims.memberId;
    nonce = qr.claims.nonce;
  } else {
    memberId = input.memberId;
  }

  const member = await db.member.findUnique({ where: { id: memberId }, select: memberSelect });
  if (!member) throw input.method === 'APP_QR' ? new AppError('QR_INVALID', 422) : new AppError('NOT_FOUND', 404);

  const [existing, roaming, count] = await Promise.all([
    db.checkIn.findUnique({
      where: { eventId_memberId: { eventId: event.id, memberId } },
      select: { checkedInAt: true, admin: { select: { name: true } } },
    }),
    member.cityId === event.cityId ? null : roamingFor(memberId, event.id),
    event.capacity ? db.checkIn.count({ where: { eventId: event.id } }) : 0,
  ]);

  const scanMember = toScanMember(member);
  let issue: CheckInPreviewResponse['issue'] = null;
  if (scanMember.status !== 'ACTIVE') issue = { code: 'MEMBER_INACTIVE' };
  else if (existing) issue = { code: 'ALREADY_CHECKED_IN', checkedInAt: existing.checkedInAt.toISOString(), byAdmin: existing.admin.name };
  else if (member.cityId !== event.cityId && !roaming) issue = { code: 'MEMBER_OTHER_CITY' };

  const ticketExpiresAt = new Date(now.getTime() + TICKET_TTL_SECONDS * 1000);
  const ticket =
    input.method === 'APP_QR' && !issue && nonce
      ? signTicket(key(), { adminId: admin.id, eventId: event.id, memberId, nonce, expiresAt: ticketExpiresAt })
      : null;

  return {
    member: scanMember,
    method: input.method,
    ticket,
    ticketExpiresAt: ticket ? ticketExpiresAt.toISOString() : null,
    issue,
    roaming: Boolean(roaming),
    capacityReached: event.capacity != null && count >= event.capacity,
  };
}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Step 2: record the check-in. Every rule is checked again; the QR nonce, the check-in row and
 * the XP ledger entry are written in one transaction, so a second scan or a replayed QR fails
 * on a unique constraint even when two crew phones race.
 */
export async function commitCheckIn(admin: AuthUser, input: CommitInput, now = new Date()): Promise<CheckInResponse> {
  let memberId: string;
  let nonce: { value: string; expiresAt: Date } | null = null;
  if (input.method === 'APP_QR') {
    const ticket = verifyTicket(key(), input.ticket, now);
    if (!ticket.ok) throw new AppError(ticket.reason === 'expired' ? 'TICKET_EXPIRED' : 'QR_INVALID', ticket.reason === 'expired' ? 410 : 422);
    if (ticket.claims.adminId !== admin.id || ticket.claims.eventId !== input.eventId) throw new AppError('FORBIDDEN', 403);
    memberId = ticket.claims.memberId;
    nonce = { value: ticket.claims.nonce, expiresAt: ticket.claims.expiresAt };
  } else {
    memberId = input.memberId;
  }

  const event = await openEventFor(admin, input.eventId, now);
  const member = await db.member.findUnique({ where: { id: memberId }, select: memberSelect });
  if (!member) throw new AppError('NOT_FOUND', 404);
  if (toScanMember(member).status !== 'ACTIVE') throw new AppError('MEMBER_INACTIVE', 409);
  const roaming = member.cityId === event.cityId ? null : await roamingFor(member.id, event.id);
  if (member.cityId !== event.cityId && !roaming) throw new AppError('MEMBER_OTHER_CITY', 409);

  const xp = await getSetting(db, 'xpPerCheckIn', { cityId: event.cityId });
  const checkIn = await db.$transaction(async (tx) => {
    if (nonce) {
      try {
        await tx.usedNonce.create({ data: { nonce: nonce.value, expiresAt: nonce.expiresAt } });
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError('QR_USED', 409);
        throw err;
      }
    }
    let row;
    try {
      row = await tx.checkIn.create({
        data: {
          eventId: event.id,
          memberId: member.id,
          method: input.method,
          adminId: admin.id,
          roamingRequestId: roaming?.id,
          manualReason: input.method === 'MANUAL' ? input.reason : null,
          checkedInAt: now,
        },
        include: attendanceInclude,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('ALREADY_CHECKED_IN', 409);
      throw err;
    }
    // Credited now, shown from Phase 3 (PLAN.md §4).
    if (xp > 0) {
      await tx.xpLedger.create({ data: { memberId: member.id, delta: xp, reason: 'CHECK_IN', refType: 'CheckIn', refId: row.id, createdAt: now } });
    }
    if (input.method === 'MANUAL') {
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'checkin.manual',
          targetType: 'CheckIn',
          targetId: row.id,
          meta: { eventId: event.id, memberId: member.id, nim: member.nim, reason: input.reason },
        },
      });
    }
    return row;
  });

  const count = await db.checkIn.count({ where: { eventId: event.id } });
  return { checkIn: toAttendanceEntry(checkIn), count };
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export const attendanceInclude = {
  member: { select: { id: true, nim: true, fullName: true, photoUrl: true, city: { select: { name: true } } } },
  admin: { select: { id: true, name: true } },
} satisfies Prisma.CheckInInclude;

export function toAttendanceEntry(c: Prisma.CheckInGetPayload<{ include: typeof attendanceInclude }>): AttendanceEntry {
  return {
    id: c.id,
    checkedInAt: c.checkedInAt.toISOString(),
    method: c.method,
    manualReason: c.manualReason,
    member: { id: c.member.id, nim: c.member.nim, fullName: c.member.fullName, photoUrl: c.member.photoUrl, cityName: c.member.city.name },
    admin: c.admin,
  };
}

/** Newest first. The live feed polls this; counts always cover the whole event. */
export async function eventAttendance(eventId: string, now = new Date(), limit = 200): Promise<AttendanceResponse> {
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const [rows, grouped] = await Promise.all([
    db.checkIn.findMany({ where: { eventId }, orderBy: { checkedInAt: 'desc' }, include: attendanceInclude, take: limit }),
    db.checkIn.groupBy({ by: ['method'], where: { eventId }, _count: { _all: true } }),
  ]);
  const byMethod = Object.fromEntries(CHECK_IN_METHODS.map((m) => [m, 0])) as Record<CheckInMethod, number>;
  for (const g of grouped) byMethod[g.method] = g._count._all;
  return {
    entries: rows.map(toAttendanceEntry),
    count: Object.values(byMethod).reduce((a, b) => a + b, 0),
    byMethod,
    phase: eventPhase(event, now),
    serverTime: now.toISOString(),
  };
}

/** Manual check-in search: the event city's members plus approved roamers, by name or NIM. */
export async function searchMembersForEvent(admin: AuthUser, eventId: string, q: string): Promise<ManualSearchResponse> {
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireCityAccess(admin, event.cityId);
  const term = q.trim();
  if (term.length < 2) return { members: [] };
  const members = await db.member.findMany({
    where: {
      AND: [
        {
          OR: [
            { cityId: event.cityId },
            { roamingRequests: { some: { eventId, type: 'ATTENDANCE', status: 'APPROVED' } } },
          ],
        },
        { OR: [{ fullName: { contains: term, mode: 'insensitive' } }, { nim: { contains: term.toUpperCase() } }] },
      ],
    },
    orderBy: { fullName: 'asc' },
    take: 20,
    select: { ...memberSelect, checkIns: { where: { eventId }, select: { checkedInAt: true } } },
  });
  return {
    members: members.map((m) => ({ ...toScanMember(m), checkedInAt: m.checkIns[0]?.checkedInAt.toISOString() ?? null })),
  };
}
