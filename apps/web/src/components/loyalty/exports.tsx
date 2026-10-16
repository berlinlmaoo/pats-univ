'use client';
import { useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { DataState, useLoyalty } from './state';
import { ERROR_MESSAGE_KEY } from '@/lib/http/errors';
export function ExportsPage() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cities = useLoyalty<{ cities: { id: string; name: string }[] }>(
    '/api/admin/loyalty/rewards',
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('loyalty.export')}
        description={t('loyalty.exportBody')}
      />
      {cities.error && (
        <DataState error={cities.error} reload={cities.reload} />
      )}
      <Card className="p-5">
        <form
          className="grid gap-4 sm:grid-cols-2"
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
          <Field label={t('loyalty.from')} htmlFor="export-from">
            <Input id="export-from" name="from" type="date" />
          </Field>
          <Field label={t('loyalty.to')} htmlFor="export-to">
            <Input id="export-to" name="to" type="date" />
          </Field>
          <Field label={t('loyalty.month')} htmlFor="export-month">
            <Input id="export-month" name="month" type="month" />
          </Field>
          {error && (
            <p role="alert" className="text-danger-fg sm:col-span-2">
              {t.loose(error)}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" name="format" value="csv" loading={busy}>
              {t('loyalty.csv')}
            </Button>
            <Button
              type="submit"
              variant="secondary"
              name="format"
              value="xlsx"
              disabled={busy}
            >
              {t('loyalty.xlsx')}
            </Button>
            <Button
              type="submit"
              variant="secondary"
              name="format"
              value="print"
              disabled={busy}
            >
              {t('loyalty.print')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
