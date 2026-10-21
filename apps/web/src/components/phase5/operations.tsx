'use client';
import { useState } from 'react';
import { ArrowRight, Gift, MapPinned, Wallet } from 'lucide-react';
import { formatDateTime, formatRupiah } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { postJson } from '@/lib/client/api';

interface Payments {
  cards: { id: string; replacementFee: number; feePaidAt: string | null; member: { fullName: string; nim: string } }[];
  reservations: { id: string; status?: 'PENDING' | 'CONFIRMED'; downPaymentAmount: number | null; downPaymentAt: string | null; minimumCharge: number; slotCode: string; member: { fullName: string }; event: { title: string } }[];
}

function ErrorLine({ error }: { error: string }) {
  const t = useT();
  return error ? <p role="alert" className="text-body-sm text-danger-fg">{t.loose(error)}</p> : null;
}

export function PaymentRecords() {
  const t = useT();
  const state = useLoyalty<Payments>('/api/admin/payments');
  const [target, setTarget] = useState<{ kind: string; id: string; amount?: number } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <section className="space-y-4" aria-label={t('phase5.payments')}>
      <p className="max-w-2xl text-body-sm text-muted">{t('phase5.paymentHint')}</p>
      <ErrorLine error={error} />
      {!state.data || state.error ? (
        <DataState error={state.error} reload={state.reload} />
      ) : !state.data.cards.length && !state.data.reservations.length ? (
        <Card>
          <EmptyState icon={Wallet} title={t('phase5.paymentsEmpty')} body={t('ops.paymentsEmptyBody')} />
        </Card>
      ) : (
        <div className="space-y-3">
          {state.data.cards.map((card) => (
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5" key={card.id}>
              <div className="min-w-0">
                <h3 className="break-words text-title3 text-fg">{card.member.fullName}</h3>
                <p className="mt-0.5 text-body-sm text-muted">
                  {t('phase5.cardFee')} · <span className="font-semibold text-fg tabular-nums">{formatRupiah(card.replacementFee)}</span>
                </p>
              </div>
              {card.feePaidAt ? (
                <div className="flex flex-col items-end gap-1">
                  <Badge tone="success" dot>{t('phase5.paid')}</Badge>
                  <span className="text-caption text-muted">{formatDateTime(new Date(card.feePaidAt), t.locale)}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="warning" dot>{t('phase5.unpaid')}</Badge>
                  <Button variant="secondary" onClick={() => setTarget({ kind: 'card', id: card.id })}>{t('phase5.markPaid')}</Button>
                </div>
              )}
            </Card>
          ))}
          {state.data.reservations.map((r) => (
            <Card className="space-y-4 p-5" key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-title3 text-fg">{r.member.fullName}</h3>
                  <p className="mt-0.5 break-words text-body-sm text-muted">
                    {r.event.title} · {r.slotCode}
                    {r.minimumCharge > 0 && <> · {t('ops.minimumShort', { amount: formatRupiah(r.minimumCharge) })}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.status && <Badge tone={r.status === 'CONFIRMED' ? 'accent' : 'neutral'}>{t.loose(`social.${r.status}`)}</Badge>}
                  <Badge tone={r.downPaymentAt ? 'success' : 'warning'} dot>{t(r.downPaymentAt ? 'phase5.paid' : 'phase5.unpaid')}</Badge>
                </div>
              </div>
              {r.downPaymentAt ? (
                <p className="text-body-sm">
                  <span className="font-semibold tabular-nums">{formatRupiah(r.downPaymentAmount ?? 0)}</span> · {formatDateTime(new Date(r.downPaymentAt), t.locale)}
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <Field className="w-full sm:w-64" htmlFor={`dp-${r.id}`} label={t('phase5.amount')} hint={amounts[r.id] ? undefined : t('ops.amountHint')}>
                    <RupiahInput id={`dp-${r.id}`} aria-describedby={`dp-${r.id}-hint`} onValueChange={(v) => setAmounts({ ...amounts, [r.id]: v })} />
                  </Field>
                  <Button variant="secondary" className="sm:mb-[22px]" disabled={!amounts[r.id]} onClick={() => setTarget({ kind: 'reservation', id: r.id, amount: amounts[r.id] ?? 0 })}>
                    {t('phase5.markPaid')}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={t('phase5.markPaid')}
        body={target?.amount ? `${t('phase5.paymentConfirm')} (${formatRupiah(target.amount)})` : t('phase5.paymentConfirm')}
        confirmLabel={t('common.save')}
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          const result = await postJson('/api/admin/payments', target);
          setBusy(false);
          setTarget(null);
          if (!result.ok) setError(result.error.messageKey);
          else await state.reload();
        }}
      />
    </section>
  );
}

export function RegionRequests() {
  const t = useT();
  const state = useLoyalty<{ requests: { id: string; reason: string; member: { fullName: string; nim: string }; fromCity: { name: string }; toCity: { name: string } }[] }>('/api/admin/region-change');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const [decision, setDecision] = useState<{ id: string; decision: 'APPROVED' | 'REJECTED'; name: string } | null>(null);
  const close = () => {
    setDecision(null);
    setNote('');
  };
  return (
    <section className="space-y-4" aria-label={t('phase5.regionChange')}>
      <ErrorLine error={error} />
      {!state.data || state.error ? (
        <DataState error={state.error} reload={state.reload} />
      ) : !state.data.requests.length ? (
        <Card>
          <EmptyState icon={MapPinned} title={t('phase5.regionEmpty')} body={t('ops.regionEmptyBody')} />
        </Card>
      ) : (
        <div className="space-y-3">
          {state.data.requests.map((r) => (
            <Card key={r.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="break-words text-title3 text-fg">{r.member.fullName}</h3>
                <Badge tone="warning" dot>{t('social.PENDING')}</Badge>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold">
                {r.fromCity.name} <ArrowRight className="size-4 text-muted" aria-label={t('ops.to')} /> {r.toCity.name}
              </p>
              {r.reason && <p className="break-words text-body-sm text-muted">{r.reason}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setDecision({ id: r.id, decision: 'APPROVED', name: r.member.fullName })}>{t('phase5.approve')}</Button>
                <Button variant="secondary" onClick={() => setDecision({ id: r.id, decision: 'REJECTED', name: r.member.fullName })}>{t('phase5.reject')}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog
        open={!!decision}
        onClose={close}
        title={t(decision?.decision === 'APPROVED' ? 'phase5.approve' : 'phase5.reject')}
        description={decision ? `${decision.name} · ${t('ops.regionDecisionHint')}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              variant={decision?.decision === 'REJECTED' ? 'danger' : 'primary'}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const result = await postJson('/api/admin/region-change', { id: decision?.id, decision: decision?.decision, note });
                setBusy(false);
                close();
                if (!result.ok) setError(result.error.messageKey);
                else await state.reload();
              }}
            >
              {t(decision?.decision === 'APPROVED' ? 'phase5.approve' : 'phase5.reject')}
            </Button>
          </>
        }
      >
        <Field htmlFor="region-note" label={t('phase5.reason')} optionalLabel={t('common.optional')}>
          <Textarea id="region-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Dialog>
    </section>
  );
}

export function FreeCredits({ credits, events }: { credits: { id: string; member: { fullName: string }; cityId: string; expiresAt: string; eventId: string | null; usedAt: string | null }[]; events: { id: string; title: string; cityId: string }[] }) {
  const t = useT();
  const [error, setError] = useState(''), [saved, setSaved] = useState('');
  return (
    <section className="space-y-4" aria-label={t('phase5.freeCredits')}>
      <ErrorLine error={error} />
      {saved && <p role="status" className="text-body-sm text-success-fg">{saved}</p>}
      {!credits.length ? (
        <Card>
          <EmptyState icon={Gift} title={t('phase5.noCredits')} body={t('ops.creditsEmptyBody')} />
        </Card>
      ) : (
        <div className="space-y-3">
          {credits.map((c) => (
            <Card key={c.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-title3 text-fg">{c.member.fullName}</h3>
                  <p className="mt-0.5 text-body-sm text-muted">{t('phase5.expires', { date: formatDateTime(new Date(c.expiresAt), t.locale) })}</p>
                </div>
                <Badge tone={c.usedAt ? 'neutral' : 'accent'} dot>{t(c.usedAt ? 'ops.creditUsed' : 'ops.creditOpen')}</Badge>
              </div>
              {!c.usedAt && (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const eventId = new FormData(e.currentTarget).get('eventId');
                    const result = await postJson('/api/admin/draw', { action: 'assign', creditId: c.id, eventId });
                    if (!result.ok) setError(result.error.messageKey);
                    else setSaved(t('loyalty.saved'));
                  }}
                >
                  <Field className="w-full sm:w-80" htmlFor={`credit-${c.id}`} label={t('phase5.assignCredit')}>
                    <Select id={`credit-${c.id}`} name="eventId" defaultValue={c.eventId ?? ''} required>
                      <option value="" disabled>{t('ops.chooseEvent')}</option>
                      {events.filter((e) => e.cityId === c.cityId).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </Select>
                  </Field>
                  <Button type="submit" variant="secondary">{t('common.save')}</Button>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
