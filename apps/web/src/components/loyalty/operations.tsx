'use client';
import { ClaimQueueLink } from '@/components/phase5/claims';
import { useState, type FormEvent } from 'react';
import { ChevronDown, ClipboardList, Users } from 'lucide-react';
import {
  formatCount,
  formatDate,
  formatRupiah,
  recapEvents,
  recapInput,
  type OperationsDto,
  type RecapDto,
  type ReportDto,
} from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-time';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { Tabs } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { postJson } from '@/lib/client/api';
import { DataState, useLoyalty } from './state';

export function OperationsPage() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'recap' | 'reports' | 'promoters'>('recap');
  const state = useLoyalty<OperationsDto>(`/api/admin/loyalty/operations?${query}`);
  const cities = useLoyalty<{ cities: { id: string; name: string }[] }>('/api/admin/loyalty/rewards');
  const done = () => {
    setMessage(t('loyalty.saved'));
    void state.reload();
  };
  const ended = state.data ? recapEvents(state.data.events) : [];
  return (
    <div className="space-y-6">
      <PageHeader title={t('loyalty.recap')} description={t('loyalty.operationsBody')} />
      <form
        className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(new URLSearchParams(new FormData(e.currentTarget) as unknown as Record<string, string>).toString());
        }}
      >
        <Field label={t('loyalty.city')} htmlFor="ops-city">
          <Select name="cityId" id="ops-city">
            <option value="">{t('loyalty.global')}</option>
            {cities.data?.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('loyalty.from')} htmlFor="ops-from">
          <DateInput name="from" id="ops-from" />
        </Field>
        <Field label={t('loyalty.to')} htmlFor="ops-to">
          <DateInput name="to" id="ops-to" />
        </Field>
        <Button type="submit" variant="secondary" size="lg">
          {t('loyalty.apply')}
        </Button>
      </form>
      {message && (
        <p role="status" className="text-body-sm text-success-fg">
          {message}
        </p>
      )}
      {!state.data || state.error ? (
        <DataState error={state.error} reload={state.reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(['members', 'checkIns', 'fulfilled', 'revenue'] as const).map((key) => (
              <Card key={key} className="px-5 py-4">
                <p className="ktm-label text-muted">{t.loose(`loyalty.${key === 'fulfilled' ? 'fulfilledCount' : key}`)}</p>
                <p className="mt-1.5 break-words text-title2 tabular-nums">
                  {key === 'revenue' ? formatRupiah(state.data!.stats[key]) : formatCount(state.data!.stats[key])}
                </p>
              </Card>
            ))}
          </div>
          <ClaimQueueLink />
          <Tabs
            label={t('loyalty.recap')}
            active={tab}
            onChange={(v) => setTab(v as typeof tab)}
            items={[
              { value: 'recap', label: t('ops.tabRecap'), count: ended.filter((e) => !e.recap).length },
              { value: 'reports', label: t('loyalty.promoter') },
              { value: 'promoters', label: t('loyalty.promoterFlag') },
            ]}
          />
          {tab === 'recap' &&
            (!ended.length ? (
              <Card>
                <EmptyState icon={ClipboardList} title={t('loyalty.emptyOperations')} body={t('ops.recapEmptyBody')} />
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-body-sm text-muted">{t('ops.recapHint')}</p>
                {ended.map((e) => (
                  <RecapForm
                    key={`${e.id}-${e.recap?.lockedAt ?? ''}`}
                    eventId={e.id}
                    title={e.title}
                    meta={`${e.city.name} · ${formatDate(new Date(e.startsAt), t.locale)}`}
                    recap={e.recap}
                    canLock={state.data!.canLockRecap}
                    done={done}
                  />
                ))}
              </div>
            ))}
          {tab === 'reports' &&
            (!state.data.reports.length ? (
              <Card>
                <EmptyState icon={Users} title={t('loyalty.emptyReports')} body={t('loyalty.emptyReportsBody')} />
              </Card>
            ) : (
              <div className="space-y-3">
                {state.data.reports.map((r) => (
                  <ReportReview key={`${r.id}-${r.status}`} report={r} />
                ))}
              </div>
            ))}
          {tab === 'promoters' &&
            (!state.data.members.length ? (
              <Card>
                <EmptyState icon={Users} title={t('ops.promotersEmpty')} body={t('ops.promotersEmptyBody')} />
              </Card>
            ) : (
              <Card className="divide-y divide-border">
                {state.data.members.map((m) => (
                  <PromoterRow key={`${m.id}-${m.isPromoter}`} member={m} done={done} />
                ))}
              </Card>
            ))}
        </>
      )}
    </div>
  );
}
function PromoterRow({
  member,
  done,
}: {
  member: OperationsDto['members'][number];
  done: () => void;
}) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="text-body-sm font-medium">{member.fullName}</p>
        <p className="text-caption text-muted">{member.nim}</p>
        {error && (
          <p role="alert" className="text-danger-fg">
            {t.loose(error)}
          </p>
        )}
      </div>
      <Button variant="secondary" onClick={() => setConfirm(true)}>
        {t(
          member.isPromoter
            ? 'loyalty.removePromoter'
            : 'loyalty.grantPromoter',
        )}
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('loyalty.promoterFlag')}
        body={member.fullName}
        confirmLabel={t(
          member.isPromoter
            ? 'loyalty.removePromoter'
            : 'loyalty.grantPromoter',
        )}
        destructive={member.isPromoter}
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          const r = await postJson(
            `/api/admin/loyalty/promoters/${member.id}`,
            { enabled: !member.isPromoter },
          );
          setBusy(false);
          setConfirm(false);
          if (r.ok) done();
          else setError(r.error.messageKey);
        }}
      />
    </div>
  );
}
export function ReportReview({
  report: r,
}: {
  report: ReportDto;
}) {
  const t = useT();
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-title3">
          {r.member.fullName} · {r.event.title}
        </h3>
        <Badge tone={r.status === 'VALIDATED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'} dot>
          {t.loose(`loyalty.${r.status}`)}
        </Badge>
      </div>
      <p className="text-body-sm">
        {t('loyalty.guestCount')}: {formatCount(r.guestCount)} ·{' '}
        {t('loyalty.receiptAmount')}:{' '}
        {r.receiptAmount === null ? '—' : formatRupiah(r.receiptAmount)}
      </p>
      <p className="text-caption text-muted">
        {t('loyalty.checkIns')}: {formatCount(r.event._count?.checkIns ?? 0)} ·{' '}
        {t('loyalty.attendanceHint')}
      </p>
      {r.guests?.length > 0 && (
        <p className="break-words text-body-sm text-muted">
          {r.guests
            .map((g) => [g.name, g.phone].filter(Boolean).join(' · '))
            .join(', ')}
        </p>
      )}
      <a
        href={`/api/loyalty/receipts/${r.id}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center text-body-sm text-accent-fg underline"
      >
        {t('loyalty.viewReceipt')}
      </a>
      {r.bonusKind && (
        <p className="text-body-sm">
          {t('loyalty.bonus')}:{' '}
          {r.bonusKind === 'CASH'
            ? formatRupiah(r.bonusValue ?? 0)
            : `${formatCount(r.bonusValue ?? 0)} XP`}
        </p>
      )}
      {r.payouts.map((p) => (
        <p key={p.id} className="text-caption text-muted">
          {formatRupiah(p.amount)} · {t.loose(`loyalty.${p.status}`)}
        </p>
      ))}
      {r.rejectReason && (
        <p className="text-body-sm text-danger-fg">{r.rejectReason}</p>
      )}
    </Card>
  );
}
export function RecapForm({
  canLock,
  eventId,
  title,
  meta,
  recap,
  done,
}: {
  eventId: string;
  title: string;
  meta?: string;
  recap: RecapDto | null;
  canLock: boolean;
  done: () => void;
}) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lock, setLock] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = recapInput.safeParse({
      eventId,
      ...Object.fromEntries(
        ['sofaCount', 'tableCount', 'fdcCount', 'paxCount', 'revenueSofa', 'revenueTable', 'revenueFdc'].map((k) => [k, Number(f.get(k) || 0)]),
      ),
      personInCharge: f.get('personInCharge'),
      accountablePerson: f.get('accountablePerson'),
      note: f.get('note'),
    });
    if (!input.success) {
      setError('validation.numberInvalid');
      e.currentTarget.querySelector<HTMLElement>(`[name="${String(input.error.issues[0]?.path[0])}"]`)?.focus();
      return;
    }
    setBusy(true);
    setError('');
    const result = await postJson('/api/admin/loyalty/recaps', input.data);
    setBusy(false);
    if (result.ok) done();
    else setError(result.error.messageKey);
  }
  const counts = ['sofaCount', 'tableCount', 'fdcCount', 'paxCount'] as const;
  const revenues = ['revenueSofa', 'revenueTable', 'revenueFdc'] as const;
  return (
    <Card className="overflow-hidden">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h3 className="break-words text-title3 text-fg">{title}</h3>
            {meta && <p className="mt-0.5 text-body-sm text-muted">{meta}</p>}
          </div>
          <div className="flex items-center gap-3">
            {recap && <span className="text-body-sm font-semibold tabular-nums text-fg">{formatRupiah(recap.total)}</span>}
            <Badge tone={recap?.lockedAt ? 'success' : recap ? 'accent' : 'warning'} dot>
              {t(recap?.lockedAt ? 'loyalty.locked' : recap ? 'ops.recapDraft' : 'ops.recapMissing')}
            </Badge>
            <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </div>
        </summary>
        <form className="space-y-4 border-t border-border p-5" onSubmit={save}>
          <fieldset disabled={!!recap?.lockedAt || busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {counts.map((k) => (
              <Field key={k} htmlFor={`${eventId}-${k}`} label={t(`loyalty.${k}`)}>
                <Input id={`${eventId}-${k}`} name={k} type="number" inputMode="numeric" min={0} max={2_000_000_000} defaultValue={recap?.[k] ?? 0} required />
              </Field>
            ))}
            {revenues.map((k) => (
              <Field key={k} htmlFor={`${eventId}-${k}`} label={t(`loyalty.${k}`)}>
                <RupiahInput id={`${eventId}-${k}`} name={k} defaultValue={recap?.[k] ?? null} />
              </Field>
            ))}
            {(['personInCharge', 'accountablePerson'] as const).map((k) => (
              <Field key={k} htmlFor={`${eventId}-${k}`} label={t(`phase5.${k}`)}>
                <Input id={`${eventId}-${k}`} name={k} required maxLength={120} defaultValue={recap?.[k] ?? ''} />
              </Field>
            ))}
            <Field className="sm:col-span-2 lg:col-span-4" htmlFor={`${eventId}-note`} label={t('loyalty.note')} optionalLabel={t('common.optional')}>
              <Textarea id={`${eventId}-note`} name="note" defaultValue={recap?.note ?? ''} />
            </Field>
          </fieldset>
          {error && (
            <p role="alert" className="text-body-sm text-danger-fg">
              {t.loose(error)}
            </p>
          )}
          {!recap?.lockedAt && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}>
                {t('common.save')}
              </Button>
              {recap && canLock && (
                <Button variant="secondary" onClick={() => setLock(true)}>
                  {t('loyalty.lock')}
                </Button>
              )}
            </div>
          )}
        </form>
      </details>
      <ConfirmDialog
        open={lock}
        onClose={() => setLock(false)}
        title={t('loyalty.lock')}
        body={t('loyalty.lockConfirm')}
        confirmLabel={t('loyalty.lock')}
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            const response = await fetch('/api/admin/loyalty/recaps', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ eventId }),
            });
            if (!response.ok) setError('errors.generic');
            else done();
          } catch {
            setError('errors.network');
          } finally {
            setBusy(false);
            setLock(false);
          }
        }}
      />
    </Card>
  );
}
