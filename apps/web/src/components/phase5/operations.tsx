'use client';
import { useState } from 'react';
import { formatDateTime, formatRupiah } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { postJson } from '@/lib/client/api';

interface Payments {
  cards: { id: string; replacementFee: number; feePaidAt: string | null; member: { fullName: string; nim: string } }[];
  reservations: { id: string; downPaymentAmount: number | null; downPaymentAt: string | null; minimumCharge: number; slotCode: string; member: { fullName: string }; event: { title: string } }[];
}
export function PaymentRecords() {
  const t = useT();
  const state = useLoyalty<Payments>('/api/admin/payments');
  const [target, setTarget] = useState<{ kind: string; id: string; amount?: number } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <section className="space-y-4"><h2 className="text-title2">{t('phase5.payments')}</h2><p className="text-muted">{t('phase5.paymentHint')}</p>
    {error && <p role="alert" className="text-danger-fg">{t.loose(error)}</p>}
    {!state.data || state.error ? <DataState error={state.error} reload={state.reload} /> : <>
      {!state.data.cards.length && !state.data.reservations.length && <p className="text-muted">{t("phase5.paymentsEmpty")}</p>}
      {state.data.cards.map(card => <Card className="space-y-3 p-5" key={card.id}><h3 className="text-title3">{card.member.fullName} · {t('phase5.cardFee')}</h3><p>{formatRupiah(card.replacementFee)} · {t(card.feePaidAt ? 'phase5.paid' : 'phase5.unpaid')}</p>
        {card.feePaidAt ? <p className="text-caption text-muted">{formatDateTime(new Date(card.feePaidAt), t.locale)}</p> : <Button variant="secondary" onClick={() => setTarget({ kind: 'card', id: card.id })}>{t('phase5.markPaid')}</Button>}
      </Card>)}
      {state.data.reservations.map(r => <Card className="space-y-3 p-5" key={r.id}><h3 className="text-title3">{r.member.fullName} · {r.event.title} · {r.slotCode}</h3><p>{t('phase5.minimumCharge')}: {formatRupiah(r.minimumCharge)}</p>
        {r.downPaymentAt ? <p>{formatRupiah(r.downPaymentAmount ?? 0)} · {formatDateTime(new Date(r.downPaymentAt), t.locale)}</p> : <>
          <Field htmlFor={`dp-${r.id}`} label={t('phase5.amount')}><Input id={`dp-${r.id}`} type="number" min={1} value={amounts[r.id] ?? ''} onChange={e => setAmounts({ ...amounts, [r.id]: e.target.value })} /></Field>
          <Button variant="secondary" disabled={!Number(amounts[r.id])} onClick={() => setTarget({ kind: 'reservation', id: r.id, amount: Number(amounts[r.id]) })}>{t('phase5.markPaid')}</Button>
        </>}
      </Card>)}
    </>}
    <ConfirmDialog open={!!target} onClose={() => setTarget(null)} title={t('phase5.markPaid')} body={t('phase5.paymentConfirm')} confirmLabel={t('common.save')} busy={busy} onConfirm={async () => {
      setBusy(true); const result = await postJson('/api/admin/payments', target); setBusy(false); setTarget(null);
      if (!result.ok) setError(result.error.messageKey); else await state.reload();
    }} />
  </section>;
}
export function RegionRequests() {
  const t = useT();
  const state = useLoyalty<{ requests: { id: string; reason: string; member: { fullName: string; nim: string }; fromCity: { name: string }; toCity: { name: string } }[] }>('/api/admin/region-change');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const [decision, setDecision] = useState<{ id: string; decision: string } | null>(null);
  return <section className="space-y-4"><h2 className="text-title2">{t('phase5.regionChange')}</h2>
    {error && <p role="alert" className="text-danger-fg">{t.loose(error)}</p>}
    {!state.data || state.error ? <DataState error={state.error} reload={state.reload} /> : !state.data.requests.length ? <p className="text-muted">{t('phase5.regionEmpty')}</p> : state.data.requests.map(r => <Card key={r.id} className="space-y-3 p-5">
      <h3 className="text-title3">{r.member.fullName} · {r.member.nim}</h3><p>{r.fromCity.name} → {r.toCity.name}</p><p>{r.reason}</p>
      <div className="flex gap-2"><Button onClick={() => setDecision({ id: r.id, decision: 'APPROVED' })}>{t('phase5.approve')}</Button><Button variant="danger" onClick={() => setDecision({ id: r.id, decision: 'REJECTED' })}>{t('phase5.reject')}</Button></div>
    </Card>)}
    <Field htmlFor="region-note" label={t('phase5.reason')}><Textarea id="region-note" value={note} onChange={e => setNote(e.target.value)} /></Field>
    <ConfirmDialog open={!!decision} onClose={() => setDecision(null)} title={t('phase5.regionChange')} body={t('phase5.regionHint')} confirmLabel={t(decision?.decision === 'APPROVED' ? 'phase5.approve' : 'phase5.reject')} busy={busy} onConfirm={async () => {
      setBusy(true); const result = await postJson('/api/admin/region-change', { ...decision, note }); setBusy(false); setDecision(null);
      if (!result.ok) setError(result.error.messageKey); else await state.reload();
    }} />
  </section>;
}
export function FreeCredits({ credits, events }: { credits: { id: string; member: { fullName: string }; cityId: string; expiresAt: string; eventId: string | null; usedAt: string | null }[]; events: { id: string; title: string; cityId: string }[] }) {
  const t = useT();
  const [error, setError] = useState(''), [saved, setSaved] = useState('');
  return <section className="space-y-4"><h2 className="text-title2">{t('phase5.freeCredits')}</h2>{error && <p role="alert" className="text-danger-fg">{t.loose(error)}</p>}{saved && <p role="status">{saved}</p>}
    {!credits.length && <p className="text-muted">{t('phase5.noCredits')}</p>}
    {credits.map(c => <Card key={c.id} className="space-y-3 p-5"><h3 className="text-title3">{c.member.fullName}</h3><p>{t('phase5.expires', { date: formatDateTime(new Date(c.expiresAt), t.locale) })}</p>
      {!c.usedAt && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); const eventId = new FormData(e.currentTarget).get('eventId'); const result = await postJson('/api/admin/draw', { action: 'assign', creditId: c.id, eventId }); if (!result.ok) setError(result.error.messageKey); else setSaved(t('loyalty.saved')); }}>
        <Field htmlFor={`credit-${c.id}`} label={t('phase5.assignCredit')}><Select id={`credit-${c.id}`} name="eventId" defaultValue={c.eventId ?? ''} required><option value="">—</option>{events.filter(e => e.cityId === c.cityId).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</Select></Field><Button type="submit" variant="secondary">{t('common.save')}</Button>
      </form>}
    </Card>)}
  </section>;
}
