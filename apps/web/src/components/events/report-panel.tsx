'use client';

import { EVENT_REPORT_FIELDS, formatCount, formatDateTime, type EventReportField, type EventReportInfo, type EventReportReference } from '@pats/shared';
import { useState, type FormEvent } from 'react';
import { useT } from '@/components/i18n/provider';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

type ReportResponse = {
  report: EventReportInfo | null;
  reference: EventReportReference;
  history: { at: string; by: string | null; changes: Record<string, { from: number | null; to: number }> | null }[];
};

const REFERENCE: Partial<Record<EventReportField, keyof EventReportReference>> = {
  tablesSold: 'tablesSold',
  sofasSold: 'sofasSold',
  membersAttended: 'membersAttended',
  newMembers: 'newMembers',
  paxTotal: 'reservationPax',
};

/** The admin event report (22 Oct): seven required numbers, system numbers shown as references only. */
export function EventReportPanel({ eventId }: { eventId: string }) {
  const t = useT();
  const state = useLoyalty<ReportResponse>(`/api/admin/events/${eventId}/report`);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  if (!state.data || state.error) return <DataState error={state.error} reload={state.reload} />;
  const { report, reference, history } = state.data;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(EVENT_REPORT_FIELDS.map((k) => [k, f.get(k) === '' ? NaN : Number(f.get(k))]));
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/report`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setFieldErrors({});
        setMessage({ ok: true, text: t('ux.report.saved') });
        await state.reload();
      } else {
        setFieldErrors(json?.error?.fields ?? {});
        setMessage({ ok: false, text: t('validation.numberInvalid') });
      }
    } catch {
      setMessage({ ok: false, text: t('errors.network') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t('ux.report.title')} description={t('ux.report.body')} className="pb-3" />
      <form className="flex flex-col gap-4 border-t border-border px-5 py-4" onSubmit={save} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {EVENT_REPORT_FIELDS.map((k) => {
            const ref = REFERENCE[k];
            return (
              <Field
                key={k}
                htmlFor={`report-${k}`}
                label={t(`ux.report.${k}`)}
                hint={ref ? t('ux.report.reference', { value: formatCount(reference[ref]) }) : k === 'fdcSold' ? t('ux.report.fdcHint') : undefined}
                error={fieldErrors[k] ? t.loose(fieldErrors[k]) : undefined}
              >
                <Input id={`report-${k}`} name={k} type="number" inputMode="numeric" min={0} max={1_000_000} required defaultValue={report ? report[k] : ''} aria-invalid={Boolean(fieldErrors[k])} />
              </Field>
            );
          })}
        </div>
        {report && <p className="text-caption text-muted">{t('ux.report.lastEdit', { name: report.updatedBy, date: formatDateTime(new Date(report.updatedAt), t.locale) })}</p>}
        <Button type="submit" className="self-start" loading={busy}>
          {t('ux.report.save')}
        </Button>
        {message && (
          <p role="status" className={message.ok ? 'text-caption text-success-fg' : 'text-caption text-danger-fg'}>
            {message.text}
          </p>
        )}
        {history.length > 1 && (
          <details className="text-caption text-muted">
            <summary className="cursor-pointer">{t('ux.report.history')}</summary>
            <ul className="mt-2 space-y-1">
              {history.map((h) => (
                <li key={h.at}>
                  {formatDateTime(new Date(h.at), t.locale)} · {h.by ?? '—'}
                  {h.changes && Object.keys(h.changes).length > 0 && (
                    <> · {Object.entries(h.changes).map(([k, v]) => `${t.loose(`ux.report.${k}`)} ${v.from ?? '—'} → ${v.to}`).join(', ')}</>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>
    </Card>
  );
}
