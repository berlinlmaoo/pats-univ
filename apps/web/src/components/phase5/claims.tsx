'use client';
import { useState } from 'react';
import { formatCount, type ClaimDto } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { postJson } from '@/lib/client/api';

export function ClaimQueue() {
  const t = useT();
  const state = useLoyalty<{ claims: ClaimDto[] }>('/api/admin/loyalty/claims');
  return <section className="space-y-4"><h2 className="text-title2">{t('phase5.claimReview')}</h2>
    {!state.data || state.error ? <DataState error={state.error} reload={state.reload} /> : !state.data.claims.length ? <p className="text-muted">{t('phase5.claimEmpty')}</p> : state.data.claims.map(claim => <ClaimReview key={`${claim.id}:${claim.status}`} claim={claim} reload={state.reload} />)}
  </section>;
}
function ClaimReview({ claim, reload }: { claim: ClaimDto; reload: () => Promise<void> }) {
  const t = useT();
  const [pax, setPax] = useState(String(claim.guestCount)), [reservations, setReservations] = useState(String(claim.reservationCount));
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  return <Card className="space-y-4 p-5">
    <h3 className="text-title3">{claim.member.fullName} · {claim.event.title}</h3>
    <p className="text-body-sm">{t(claim.formType === 'PR' ? 'phase5.claimPr' : 'phase5.claimMember')} · {t.loose(`social.${claim.status}`)}</p>
    {claim.notes && <p className="text-body-sm">{claim.notes}</p>}
    {claim.receiptUrl && <a className="inline-flex min-h-11 items-center text-accent-fg underline" href={`/api/loyalty/claims/${claim.id}/receipt`} target="_blank" rel="noreferrer">{t('loyalty.viewReceipt')}</a>}
    {claim.status === 'PENDING' ? <>
      <p className="text-caption text-muted">{t('phase5.claimAdjustHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor={`gl-${claim.id}`} label={t('phase5.guestCount')}><Input id={`gl-${claim.id}`} type="number" min={0} value={pax} onChange={e => setPax(e.target.value)} /></Field>
        <Field htmlFor={`res-${claim.id}`} label={t('phase5.reservationCount')}><Input id={`res-${claim.id}`} type="number" min={0} value={reservations} onChange={e => setReservations(e.target.value)} /></Field>
      </div>
      <Field htmlFor={`why-${claim.id}`} label={t('phase5.reason')}><Textarea id={`why-${claim.id}`} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !pax || !reservations} onClick={() => setDecision('APPROVED')}>{t('phase5.approve')}</Button><Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => setDecision('REJECTED')}>{t('phase5.reject')}</Button></div>
    </> : <p>{formatCount(claim.bonusValue ?? 0)} XP {claim.rejectReason && `· ${claim.rejectReason}`}</p>}
    {error && <p role="alert" className="text-danger-fg">{t.loose(error)}</p>}
    <ConfirmDialog open={!!decision} onClose={() => setDecision(null)} title={t('phase5.claimReview')} body={decision === 'APPROVED' ? t('phase5.claimApproveConfirm') : reason} confirmLabel={t(decision === 'APPROVED' ? 'phase5.approve' : 'phase5.reject')} destructive={decision === 'REJECTED'} busy={busy} onConfirm={async () => {
      setBusy(true); setError(''); const result = await postJson('/api/admin/loyalty/claims', { id: claim.id, decision, guestCount: Number(pax), reservationCount: Number(reservations), reason });
      setBusy(false); setDecision(null); if (!result.ok) setError(result.error.messageKey); else await reload();
    }} />
  </Card>;
}
