import { isLocale } from '@pats/shared';
import type { Metadata } from 'next';
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
const DATASET_LABEL = {
  member: 'loyalty.member',
  checkin: 'loyalty.checkin',
  ledger: 'loyalty.ledgerExport',
  leaderboard: 'loyalty.leaderboardExport',
  redemption: 'loyalty.redemption',
  report: 'loyalty.reportExport',
  recap: 'loyalty.recapExport',
} as const;

function datasetLabel(dataset: string | undefined) {
  return DATASET_LABEL[(dataset ?? 'recap') as keyof typeof DATASET_LABEL] ?? 'loyalty.export';
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<Metadata> {
  const t = await getT();
  return { title: `${t(datasetLabel((await searchParams).dataset))} · ${t('loyalty.export')}` };
}

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
        <div className="min-w-0">
          <h1 className="text-title1 text-fg">
            {t(datasetLabel(dataset))}
            {params.month ? ` · ${params.month}` : ''}
          </h1>
          <p className="mt-1 text-body-sm text-muted">
            {t('loyalty.export')} · {t('common.appName')}
          </p>
        </div>
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
