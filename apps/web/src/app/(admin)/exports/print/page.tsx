import { isLocale } from '@pats/shared';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import {
  exportDatasets,
  exportTable,
  type ExportDataset,
} from '@/lib/loyalty/export';
import { periodFilters } from '@/lib/loyalty/filters';
import { PrintButton } from './print-button';
export default async function PrintExport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireHq();
  const params = await searchParams;
  const t = await getT();
  const dataset = (params.dataset ?? 'recap') as ExportDataset;
  if (!exportDatasets.includes(dataset)) notFound();
  const p = new URLSearchParams(
    Object.entries(params).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
  const table = await exportTable(
    user,
    dataset,
    isLocale(params.locale) ? params.locale : t.locale,
    { ...periodFilters(p), month: params.month, eventId: params.eventId },
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title1">
          {t('loyalty.export')} · {t('common.appName')}
        </h1>
        <PrintButton />
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <Th key={i}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <Tr key={i}>
                {r.map((cell, j) => (
                  <Td key={j}>{cell}</Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
