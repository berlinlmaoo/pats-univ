'use client';
import { useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { formatMonth, zonedParts } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-time';
import { Field, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { DataState, useLoyalty } from './state';
import { ERROR_MESSAGE_KEY } from '@/lib/http/errors';
/** The last 18 calendar months (WIB), newest first, as the API's "YYYY-MM". */
function recentMonths() {
  const now = zonedParts(new Date());
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(Date.UTC(now.year, now.month - 1 - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    return { value: `${year}-${String(month).padStart(2, '0')}`, year, month };
  });
}

export function ExportsPage() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cities = useLoyalty<{ cities: { id: string; name: string }[] }>(
    '/api/admin/loyalty/rewards',
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('loyalty.export')}
        description={t('loyalty.exportBody')}
      />
      {cities.error && (
        <DataState error={cities.error} reload={cities.reload} />
      )}
      <Card className="p-5 sm:p-6">
        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const params = new URLSearchParams();
            f.forEach((v, k) => params.set(k, String(v)));
            params.set('locale', t.locale);
            const submitter = (e.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null;
            if (submitter?.value === 'print') {
              window.open(
                `/exports/print?${params}`,
                '_blank',
                'noopener,noreferrer',
              );
              return;
            }
            params.set('format', submitter?.value ?? 'csv');
            setBusy(true);
            setError('');
            try {
              const res = await fetch(`/api/hq/export?${params}`);
              if (!res.ok) {
                const json = await res.json();
                setError(
                  ERROR_MESSAGE_KEY[
                    json.error?.code as keyof typeof ERROR_MESSAGE_KEY
                  ] ?? 'errors.generic',
                );
                return;
              }
              const url = URL.createObjectURL(await res.blob());
              const a = document.createElement('a');
              a.href = url;
              a.download = `pats-${f.get('dataset')}.${params.get('format')}`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch {
              setError('errors.network');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t('loyalty.dataset')} htmlFor="export-dataset">
            <Select id="export-dataset" name="dataset">
              {[
                ['member', 'member'],
                ['checkin', 'checkin'],
                ['ledger', 'ledgerExport'],
                ['leaderboard', 'leaderboardExport'],
                ['redemption', 'redemption'],
                ['report', 'reportExport'],
                ['recap', 'recapExport'],
              ].map(([v, k]) => (
                <option key={v} value={v}>
                  {t.loose(`loyalty.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('loyalty.city')} htmlFor="export-city">
            <Select id="export-city" name="cityId">
              <option value="">{t('loyalty.global')}</option>
              {cities.data?.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <h2 className="ktm-label border-t border-border pt-5 text-muted sm:col-span-2">{t('loyalty.period')}</h2>
          <Field label={t('loyalty.monthPick')} htmlFor="export-month" hint={t('loyalty.monthHint')}>
            <Select id="export-month" name="month" defaultValue="" aria-describedby="export-month-hint">
              <option value="">{t('loyalty.anyMonth')}</option>
              {recentMonths().map((m) => (
                <option key={m.value} value={m.value}>
                  {formatMonth(m.year, m.month, t.locale)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="hidden sm:block" aria-hidden="true" />
          <Field label={t('loyalty.from')} htmlFor="export-from">
            <DateInput id="export-from" name="from" />
          </Field>
          <Field label={t('loyalty.to')} htmlFor="export-to">
            <DateInput id="export-to" name="to" />
          </Field>
          {error && (
            <p role="alert" className="text-danger-fg sm:col-span-2">
              {t.loose(error)}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5 sm:col-span-2">
            <Button
              type="submit"
              variant="secondary"
              name="format"
              value="print"
              disabled={busy}
            >
              <Printer aria-hidden="true" />
              {t('loyalty.print')}
            </Button>
            <Button
              type="submit"
              variant="secondary"
              name="format"
              value="xlsx"
              disabled={busy}
            >
              <FileSpreadsheet aria-hidden="true" />
              {t('loyalty.xlsx')}
            </Button>
            <Button type="submit" name="format" value="csv" loading={busy}>
              {!busy && <Download aria-hidden="true" />}
              {t('loyalty.csv')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
