import { isLocale } from '@pats/shared';
import { requireApiUser } from '@/lib/auth/current-user';
import { AppError } from '@/lib/http/errors';
import { route } from '@/lib/http/respond';
import {
  csvText,
  exportDatasets,
  exportTable,
  xlsxBytes,
  type ExportDataset,
} from '@/lib/loyalty/export';
import { periodFilters } from '@/lib/loyalty/filters';
export const GET = route(async (req: Request) => {
  const admin = await requireApiUser(req, ['SUPER_ADMIN']);
  const p = new URL(req.url).searchParams;
  const dataset = p.get('dataset') as ExportDataset;
  const format = p.get('format') ?? 'csv';
  if (!exportDatasets.includes(dataset) || !['csv', 'xlsx'].includes(format))
    throw new AppError('VALIDATION', 422);
  const locale = p.get('locale');
  const table = await exportTable(
    admin,
    dataset,
    isLocale(locale) ? locale : admin.locale,
    {
      ...periodFilters(p),
      month: p.get('month') || undefined,
      eventId: p.get('eventId') || undefined,
    },
  );
  const bytes = format === 'csv' ? csvText(table) : await xlsxBytes(table);
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type':
        format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pats-${dataset}.${format}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
