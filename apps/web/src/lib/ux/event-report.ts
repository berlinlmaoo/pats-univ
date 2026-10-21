import 'server-only';
import {
  can,
  EVENT_REPORT_FIELDS,
  eventReportInput,
  sumReports,
  zonedParts,
  type EventReportInfo,
  type EventReportNumbers,
  type EventReportReference,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { atomic } from '../loyalty/transaction';
import { soldByEvent } from './reservations';

/**
 * Admin event report (owner, 22 Oct 2026): seven numbers per event, typed by the city's regional
 * admin or HQ, one report per event, every save audited. The server's own counts are shown next to
 * the inputs as references and never overwrite what the admin typed.
 */

type ReportRow = Prisma.EventReportGetPayload<{ include: { updatedBy: { select: { name: true } } } }>;

const numbers = (r: EventReportNumbers): EventReportNumbers =>
  Object.fromEntries(EVENT_REPORT_FIELDS.map((f) => [f, r[f]])) as EventReportNumbers;

export function toReportInfo(r: ReportRow): EventReportInfo {
  return { id: r.id, eventId: r.eventId, ...numbers(r), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), updatedBy: r.updatedBy.name };
}

function requireStaffCity(user: AuthUser, cityId: string) {
  if (!can(user.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  requireCityAccess(user, cityId);
}

export async function reportReference(event: { id: string; cityId: string; checkInOpensAt: Date; endsAt: Date }): Promise<EventReportReference> {
  const [sold, membersAttended, newMembers] = await Promise.all([
    soldByEvent([event.id]),
    db.checkIn.count({ where: { eventId: event.id } }),
    db.member.count({ where: { cityId: event.cityId, joinedAt: { gte: event.checkInOpensAt, lte: event.endsAt } } }),
  ]);
  const s = sold.get(event.id)!;
  return { tablesSold: s.table, sofasSold: s.sofa, membersAttended, newMembers, reservationPax: s.pax };
}

/** GET /api/admin/events/:id/report */
export async function eventReport(user: AuthUser, eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError('NOT_FOUND', 404);
  requireStaffCity(user, event.cityId);
  const [row, reference, history] = await Promise.all([
    db.eventReport.findUnique({ where: { eventId }, include: { updatedBy: { select: { name: true } } } }),
    reportReference(event),
    db.auditLog.findMany({ where: { action: 'event.report.saved', targetType: 'Event', targetId: eventId }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return {
    eventId,
    report: row ? toReportInfo(row) : null,
    reference,
    canEdit: true,
    history: history.map((h) => ({ at: h.createdAt.toISOString(), by: h.actor?.name ?? null, changes: (h.meta as { changes?: unknown } | null)?.changes ?? null })),
  };
}

/** PUT /api/admin/events/:id/report: all seven numbers, required; creates or replaces the one report. */
export async function saveEventReport(user: AuthUser, eventId: string, raw: unknown) {
  const input = eventReportInput.parse(raw);
  await atomic(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new AppError('NOT_FOUND', 404);
    requireStaffCity(user, event.cityId);
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    const before = await tx.eventReport.findUnique({ where: { eventId } });
    const changes = Object.fromEntries(
      EVENT_REPORT_FIELDS.filter((f) => !before || before[f] !== input[f]).map((f) => [f, { from: before ? before[f] : null, to: input[f] }]),
    );
    await tx.eventReport.upsert({
      where: { eventId },
      create: { eventId, cityId: event.cityId, ...input, createdById: user.id, updatedById: user.id },
      update: { ...input, updatedById: user.id },
    });
    await tx.auditLog.create({ data: { actorId: user.id, action: 'event.report.saved', targetType: 'Event', targetId: eventId, meta: { created: !before, changes } } });
  });
  return eventReport(user, eventId);
}

type ListFilters = { cityId?: string | null; from?: Date; to?: Date };

/** HQ dashboard (regional admins: their city): every event with its report, per-city totals and the monthly trend. */
export async function eventReportList(user: AuthUser, filters: ListFilters = {}) {
  if (!can(user.role, 'city.operations')) throw new AppError('FORBIDDEN', 403);
  const hq = can(user.role, 'hq.manage');
  const cityId = hq ? filters.cityId || undefined : user.cityId!;
  if (!hq && filters.cityId && filters.cityId !== user.cityId) throw new AppError('FORBIDDEN', 403);
  const events = await db.event.findMany({
    where: { cityId, status: { not: 'DRAFT' }, ...(filters.from || filters.to ? { startsAt: { gte: filters.from, lt: filters.to } } : {}) },
    include: { city: { select: { id: true, name: true, timezone: true } }, report: { include: { updatedBy: { select: { name: true } } } } },
    orderBy: { startsAt: 'desc' },
    take: 500,
  });
  const rows = events.map((e) => ({
    event: { id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), city: { id: e.city.id, name: e.city.name } },
    report: e.report ? toReportInfo(e.report) : null,
  }));
  const byCity = new Map<string, { city: { id: string; name: string }; events: number; reported: number; totals: EventReportNumbers[] }>();
  const byMonth = new Map<string, { cityId: string; cityName: string; month: string; events: number; reported: number; totals: EventReportNumbers[] }>();
  for (const e of events) {
    const c = byCity.get(e.city.id) ?? { city: { id: e.city.id, name: e.city.name }, events: 0, reported: 0, totals: [] };
    c.events++;
    const p = zonedParts(e.startsAt, e.city.timezone);
    const month = `${p.year}-${String(p.month).padStart(2, '0')}`;
    const key = `${e.city.id}:${month}`;
    const m = byMonth.get(key) ?? { cityId: e.city.id, cityName: e.city.name, month, events: 0, reported: 0, totals: [] };
    m.events++;
    if (e.report) {
      c.reported++;
      c.totals.push(e.report);
      m.reported++;
      m.totals.push(e.report);
    }
    byCity.set(e.city.id, c);
    byMonth.set(key, m);
  }
  return {
    fields: EVENT_REPORT_FIELDS,
    events: rows,
    totals: [...byCity.values()].map((c) => ({ city: c.city, events: c.events, reported: c.reported, totals: sumReports(c.totals) })).sort((a, b) => a.city.name.localeCompare(b.city.name)),
    trend: [...byMonth.values()]
      .map((m) => ({ city: { id: m.cityId, name: m.cityName }, month: m.month, events: m.events, reported: m.reported, totals: sumReports(m.totals) }))
      .sort((a, b) => a.city.name.localeCompare(b.city.name) || a.month.localeCompare(b.month)),
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One row per event (blank numbers = not reported yet). UTF-8 with BOM for Excel. */
export function eventReportCsv(list: Awaited<ReturnType<typeof eventReportList>>): string {
  const header = ['event_id', 'event', 'city', 'starts_at', ...EVENT_REPORT_FIELDS.map((f) => f.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)), 'updated_by', 'updated_at'];
  const lines = list.events.map((r) =>
    [r.event.id, r.event.title, r.event.city.name, r.event.startsAt, ...EVENT_REPORT_FIELDS.map((f) => (r.report ? r.report[f] : '')), r.report?.updatedBy ?? '', r.report?.updatedAt ?? '']
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
