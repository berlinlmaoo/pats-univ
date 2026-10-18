import { can } from '@pats/shared';
import 'server-only';
import {
  createTranslator,
  formatCount,
  formatDateTime,
  formatRupiah,
  type Locale,
} from '@pats/shared';
import type { Prisma } from '@/generated/prisma';
import type { AuthUser } from '../auth/current-user';
import { db } from '../db';
import { AppError } from '../http/errors';
import { leaderboard } from './leaderboard';
import { expireRedemptions } from './rewards';

export type ExportDataset =
  | 'member'
  | 'checkin'
  | 'ledger'
  | 'leaderboard'
  | 'redemption'
  | 'report'
  | 'recap';
export const exportDatasets: ExportDataset[] = [
  'member',
  'checkin',
  'ledger',
  'leaderboard',
  'redemption',
  'report',
  'recap',
];
export interface ExportTable {
  headers: string[];
  rows: (string | number | null)[][];
}

/** Escape formula prefixes before CSV quoting, including leading whitespace/control characters. */
export function safeExportText(value: unknown) {
  const text = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)
    ? `'${text}`
    : text;
}
export function csvText(table: ExportTable) {
  const cell = (v: unknown) => `"${safeExportText(v).replaceAll('"', '""')}"`;
  return (
    '\uFEFF' +
    [table.headers, ...table.rows]
      .map((r) => r.map(cell).join(','))
      .join('\r\n') +
    '\r\n'
  );
}
export async function xlsxBytes(table: ExportTable) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('PATS University');
  sheet.addRow(table.headers);
  // Display values use the same house format on every spreadsheet locale.
  for (const row of table.rows)
    sheet.addRow(
      row.map((v) => (typeof v === 'string' ? safeExportText(v) : v)),
    );
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: table.headers.length },
  };
  sheet.columns.forEach((column, i) => {
    column.width = Math.min(60, Math.max(18, table.headers[i]!.length + 4));
  });
  sheet.getRow(1).font = { bold: true };
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function exportTable(
  admin: AuthUser,
  dataset: ExportDataset,
  locale: Locale,
  filters: {
    cityId?: string;
    from?: Date;
    to?: Date;
    month?: string;
    eventId?: string;
  },
): Promise<ExportTable> {
  if (!can(admin.role, 'hq.manage')) throw new AppError('FORBIDDEN', 403);
  const t = createTranslator(locale);
  const h = (key: string) => t.loose(`loyalty.${key}`);
  const date = (v: Date | null) =>
    v ? formatDateTime(v, locale, { withYear: true }) : '';
  const range = { gte: filters.from, lt: filters.to };
  const cityId = filters.cityId;
  const memberWhere: Prisma.MemberWhereInput = { cityId };
  let table: ExportTable;
  switch (dataset) {
    case 'member': {
      const rows = await db.member.findMany({
        where: { cityId, joinedAt: range },
        include: { user: true, city: true },
        orderBy: { nim: 'asc' },
      });
      table = {
        headers: [
          'NIM',
          h('member'),
          h('city'),
          t('members.drink'),
          t('members.genre'),
          t('join.email'),
          t('join.phone'),
          h('promoterFlag'),
        ],
        rows: rows.map((r) => [
          r.nim,
          r.fullName,
          r.city.name,
          r.favoriteDrink,
          r.favoriteGenre,
          r.user.email,
          r.user.phone,
          r.isPromoter ? h('active') : '',
        ]),
      };
      break;
    }
    case 'checkin': {
      const rows = await db.checkIn.findMany({
        where: { event: { cityId }, checkedInAt: range },
        include: { member: true, event: true, admin: true },
        orderBy: { checkedInAt: 'asc' },
      });
      table = {
        headers: [
          'NIM',
          h('member'),
          h('event'),
          t('events.colMethod'),
          t('events.colTime'),
          t('events.colBy'),
        ],
        rows: rows.map((r) => [
          r.member.nim,
          r.member.fullName,
          r.event.title,
          t.loose(`checkInMethod.${r.method}`),
          date(r.checkedInAt),
          r.admin.name,
        ]),
      };
      break;
    }
    case 'ledger': {
      const rows = await db.xpLedger.findMany({
        where: { member: memberWhere, createdAt: range },
        include: { member: true },
        orderBy: { createdAt: 'asc' },
      });
      table = {
        headers: ['NIM', h('member'), h('xp'), h('reason'), h('period')],
        rows: rows.map((r) => [
          r.member.nim,
          r.member.fullName,
          formatCount(r.delta),
          h(r.reason),
          date(r.createdAt),
        ]),
      };
      break;
    }
    case 'leaderboard': {
      const b = await leaderboard({
        cityId,
        month: filters.month,
        eventId: filters.eventId,
      });
      table = {
        headers: [h('rank'), h('member'), h('city'), h('xp')],
        rows: b.entries.map((r) => [
          formatCount(r.rank),
          r.name,
          r.city,
          formatCount(r.xp),
        ]),
      };
      break;
    }
    case 'redemption': {
      await expireRedemptions();
      const rows = await db.redemption.findMany({
        where: { event: { cityId }, issuedAt: range },
        include: { member: true, reward: true, event: true },
        orderBy: { issuedAt: 'asc' },
      });
      table = {
        headers: [
          'NIM',
          h('member'),
          h('name'),
          h('event'),
          h('type'),
          h('code'),
          t('common.status'),
          h('period'),
        ],
        rows: rows.map((r) => [
          r.member.nim,
          r.member.fullName,
          r.reward.name,
          r.event?.title ?? '',
          h(r.kind),
          r.code,
          h(r.status),
          date(r.issuedAt),
        ]),
      };
      break;
    }
    case 'report': {
      const rows = await db.xpClaim.findMany({ where: { event: { cityId }, createdAt: range }, include: { member: true, event: true }, orderBy: { createdAt: 'asc' } });
      table = {
        headers: ['NIM', h('member'), h('event'), t('phase5.claimForm'), t('phase5.guestCount'), t('phase5.reservationCount'), t('common.status'), h('bonus'), h('reason'), h('receipt')],
        rows: rows.map(r => [r.member.nim, r.member.fullName, r.event.title, r.formType, formatCount(r.guestCount), formatCount(r.reservationCount), t.loose(`social.${r.status}`), `${formatCount(r.bonusValue ?? 0)} XP`, r.rejectReason, r.receiptUrl ? `/api/loyalty/claims/${r.id}/receipt` : '']),
      };
      break;
    }
    case 'recap': {
      const rows = await db.trafficRecap.findMany({
        where: { cityId, event: { startsAt: range } },
        include: { event: true, city: true },
        orderBy: { event: { startsAt: 'asc' } },
      });
      table = {
        headers: [
          h('event'),
          h('city'),
          h('sofaCount'),
          h('tableCount'),
          h('fdcCount'),
          h('paxCount'),
          h('revenueSofa'),
          h('revenueTable'),
          h('revenueFdc'),
          h('total'),
          t('phase5.personInCharge'),
          t('phase5.accountablePerson'),
          h('note'),
        ],
        rows: rows.map((r) => [
          r.event.title,
          r.city.name,
          formatCount(r.sofaCount),
          formatCount(r.tableCount),
          formatCount(r.fdcCount),
          formatCount(r.paxCount),
          formatRupiah(r.revenueSofa),
          formatRupiah(r.revenueTable),
          formatRupiah(r.revenueFdc),
          formatRupiah(r.total),
          r.personInCharge,
          r.accountablePerson,
          r.note,
        ]),
      };
      break;
    }
    default:
      throw new AppError('VALIDATION', 422);
  }
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'data.export',
      targetType: dataset,
      meta: {
        cityId: cityId ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
        rows: table.rows.length,
      },
    },
  });
  return table;
}
