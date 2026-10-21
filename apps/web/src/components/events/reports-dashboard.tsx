'use client';

import { EVENT_REPORT_FIELDS, formatCount, formatDate, type EventReportInfo, type EventReportNumbers } from '@pats/shared';
import { ClipboardList, Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-time';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';

type ListResponse = {
  events: { event: { id: string; title: string; startsAt: string; city: { id: string; name: string } }; report: EventReportInfo | null }[];
  totals: { city: { id: string; name: string }; events: number; reported: number; totals: EventReportNumbers }[];
  trend: { city: { id: string; name: string }; month: string; events: number; reported: number; totals: EventReportNumbers }[];
};

const num = (n: number | undefined) => (n === undefined ? '—' : formatCount(n));

export function ReportsDashboard({ cities }: { cities: { id: string; name: string }[] }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const state = useLoyalty<ListResponse>(`/api/admin/event-reports?${query}`);
  const heads = EVENT_REPORT_FIELDS.map((f) => (
    <Th key={f} className="whitespace-nowrap text-right">{t(`ux.report.${f}`)}</Th>
  ));
  return (
    <div className="space-y-6">
      <PageHeader title={t('ux.report.dashboardTitle')} description={t('ux.report.dashboardBody')} />
      <form
        className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const q = new URLSearchParams();
          for (const k of ['cityId', 'from', 'to']) if (f.get(k)) q.set(k, String(f.get(k)));
          setQuery(q.toString());
        }}
      >
        {cities.length > 0 && (
          <Field label={t('ux.report.colCity')} htmlFor="rep-city">
            <Select name="cityId" id="rep-city">
              <option value="">{t('ux.report.allCities')}</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('ux.report.from')} htmlFor="rep-from"><DateInput name="from" id="rep-from" /></Field>
        <Field label={t('ux.report.to')} htmlFor="rep-to"><DateInput name="to" id="rep-to" /></Field>
        <Button type="submit" variant="secondary" size="lg">{t('ux.report.apply')}</Button>
        <a href={`/api/admin/event-reports?${query}${query ? '&' : ''}format=csv`} className={buttonClass('secondary', 'lg')}>
          <Download aria-hidden="true" />
          {t('ux.report.exportCsv')}
        </a>
      </form>
      {!state.data || state.error ? (
        <DataState error={state.error} reload={state.reload} />
      ) : !state.data.events.length ? (
        <Card><EmptyState icon={ClipboardList} title={t('ux.report.empty')} body={t('ux.report.emptyBody')} /></Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader title={t('ux.report.totals')} className="pb-3" />
            <div className="overflow-x-auto">
              <Table>
                <thead><tr><Th>{t('ux.report.colCity')}</Th><Th className="text-right">{t('ux.report.events')}</Th><Th className="text-right">{t('ux.report.reported')}</Th>{heads}</tr></thead>
                <tbody>
                  {state.data.totals.map((c) => (
                    <Tr key={c.city.id}>
                      <Td className="font-medium text-fg">{c.city.name}</Td>
                      <Td className="text-right tabular-nums">{num(c.events)}</Td>
                      <Td className="text-right tabular-nums">{num(c.reported)}</Td>
                      {EVENT_REPORT_FIELDS.map((f) => <Td key={f} className="text-right tabular-nums">{num(c.totals[f])}</Td>)}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={t('ux.report.trend')} className="pb-3" />
            <div className="overflow-x-auto">
              <Table>
                <thead><tr><Th>{t('ux.report.colCity')}</Th><Th>{t('ux.report.month')}</Th><Th className="text-right">{t('ux.report.events')}</Th><Th className="text-right">{t('ux.report.reported')}</Th>{heads}</tr></thead>
                <tbody>
                  {state.data.trend.map((m) => (
                    <Tr key={`${m.city.id}:${m.month}`}>
                      <Td className="font-medium text-fg">{m.city.name}</Td>
                      <Td className="tabular-nums">{m.month}</Td>
                      <Td className="text-right tabular-nums">{num(m.events)}</Td>
                      <Td className="text-right tabular-nums">{num(m.reported)}</Td>
                      {EVENT_REPORT_FIELDS.map((f) => <Td key={f} className="text-right tabular-nums">{num(m.totals[f])}</Td>)}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={t('ux.report.dashboardTitle')} className="pb-3" />
            <div className="overflow-x-auto">
              <Table>
                <thead><tr><Th>{t('ux.report.colEvent')}</Th><Th>{t('ux.report.colCity')}</Th><Th>{t('ux.report.colDate')}</Th>{heads}</tr></thead>
                <tbody>
                  {state.data.events.map((r) => (
                    <Tr key={r.event.id}>
                      <Td className="max-w-64"><Link href={`/events/${r.event.id}`} className="block truncate font-medium text-fg hover:underline">{r.event.title}</Link></Td>
                      <Td className="whitespace-nowrap">{r.event.city.name}</Td>
                      <Td className="whitespace-nowrap tabular-nums">{formatDate(new Date(r.event.startsAt), t.locale)}</Td>
                      {r.report
                        ? EVENT_REPORT_FIELDS.map((f) => <Td key={f} className="text-right tabular-nums">{num(r.report![f])}</Td>)
                        : <Td colSpan={EVENT_REPORT_FIELDS.length} className="text-muted">{t('ux.report.notFilled')}</Td>}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
