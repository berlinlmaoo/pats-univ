'use client';
import { useState } from 'react';
import { ClipboardCheck, History } from 'lucide-react';
import { formatCount, formatDateTime, splitClaims, type ClaimDto } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs } from '@/components/ui/tabs';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { postJson } from '@/lib/client/api';

const STATUS_TONE: Record<ClaimDto['status'], BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' };

export function ClaimStatusBadge({ status }: { status: ClaimDto['status'] }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]} dot>{t.loose(`social.${status}`)}</Badge>;
}

/** The one XP-claim review queue: pending first (the work), decided claims under History. */
export function ClaimQueue() {
  const t = useT();
  const state = useLoyalty<{ claims: ClaimDto[] }>('/api/admin/loyalty/claims');
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  if (!state.data || state.error) return <DataState error={state.error} reload={state.reload} />;
  const { pending, history } = splitClaims(state.data.claims);
  const list = tab === 'pending' ? pending : history;
  return (
    <section className="space-y-4" aria-labelledby="claims-title">
      <h2 id="claims-title" className="sr-only">{t('phase5.claimReview')}</h2>
      <Tabs
        label={t('phase5.claimReview')}
        active={tab}
        onChange={(v) => setTab(v as 'pending' | 'history')}
        items={[
          { value: 'pending', label: t('ops.claimsPending'), count: pending.length },
          { value: 'history', label: t('ops.claimsHistory') },
        ]}
      />
      {!list.length ? (
        <Card>
          {tab === 'pending' ? (
            <EmptyState icon={ClipboardCheck} title={t('ops.claimsPendingEmpty')} body={t('ops.claimsPendingEmptyBody')} />
          ) : (
            <EmptyState icon={History} title={t('ops.claimsHistoryEmpty')} body={t('ops.claimsHistoryEmptyBody')} />
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((claim) => (
            <ClaimReview key={`${claim.id}:${claim.status}`} claim={claim} reload={state.reload} />
          ))}
        </div>
      )}
    </section>
  );
}

/** For pages that only need to point at the queue (recaps): count + link, never a second queue. */
export function ClaimQueueLink() {
  const t = useT();
  const state = useLoyalty<{ claims: ClaimDto[] }>('/api/admin/loyalty/claims');
  const pending = state.data ? splitClaims(state.data.claims).pending.length : null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="ktm-label text-muted">{t('phase5.claimReview')}</p>
        <p className="mt-1 text-body text-fg">
          {pending === null ? t('common.loading') : pending ? t('ops.claimsWaiting', { count: formatCount(pending) }) : t('ops.claimsPendingEmpty')}
        </p>
      </div>
      <ButtonLink href="/regional?tab=claims" variant="secondary">
        {t('ops.openQueue')}
      </ButtonLink>
    </Card>
  );
}

function ClaimReview({ claim, reload }: { claim: ClaimDto; reload: () => Promise<void> }) {
  const t = useT();
  const [pax, setPax] = useState(String(claim.guestCount)), [reservations, setReservations] = useState(String(claim.reservationCount));
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-title3 text-fg">{claim.member.fullName}</h3>
          <p className="mt-0.5 break-words text-body-sm text-muted">
            {claim.event.title} · {t(claim.formType === 'PR' ? 'phase5.claimPr' : 'phase5.claimMember')}
            {claim.createdAt ? ` · ${formatDateTime(new Date(claim.createdAt), t.locale)}` : ''}
          </p>
        </div>
        <ClaimStatusBadge status={claim.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <div>
          <dt className="ktm-label text-muted">{t('phase5.guestCount')}</dt>
          <dd className="mt-0.5 text-title3 tabular-nums">{formatCount(claim.guestCount)}</dd>
        </div>
        <div>
          <dt className="ktm-label text-muted">{t('phase5.reservationCount')}</dt>
          <dd className="mt-0.5 text-title3 tabular-nums">{formatCount(claim.reservationCount)}</dd>
        </div>
      </dl>
      {claim.notes && <p className="break-words text-body-sm">{claim.notes}</p>}
      {claim.receiptUrl && (
        <a className="inline-flex min-h-11 items-center text-body-sm font-semibold text-accent-fg underline" href={`/api/loyalty/claims/${claim.id}/receipt`} target="_blank" rel="noreferrer">
          {t('loyalty.viewReceipt')}
        </a>
      )}
      {claim.status === 'PENDING' ? (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-caption text-muted">{t('phase5.claimAdjustHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor={`gl-${claim.id}`} label={t('phase5.guestCount')}>
              <Input id={`gl-${claim.id}`} type="number" inputMode="numeric" min={0} value={pax} onChange={(e) => setPax(e.target.value)} />
            </Field>
            <Field htmlFor={`res-${claim.id}`} label={t('phase5.reservationCount')}>
              <Input id={`res-${claim.id}`} type="number" inputMode="numeric" min={0} value={reservations} onChange={(e) => setReservations(e.target.value)} />
            </Field>
          </div>
          <Field htmlFor={`why-${claim.id}`} label={t('phase5.reason')} hint={t('ops.rejectReasonHint')}>
            <Textarea id={`why-${claim.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !pax || !reservations} onClick={() => setDecision('APPROVED')}>
              {t('phase5.approve')}
            </Button>
            <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => setDecision('REJECTED')}>
              {t('phase5.reject')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-body-sm text-muted">
          {claim.status === 'APPROVED' ? `+${formatCount(claim.bonusValue ?? 0)} XP` : claim.rejectReason}
        </p>
      )}
      {error && <p role="alert" className="text-body-sm text-danger-fg">{t.loose(error)}</p>}
      <ConfirmDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        title={t('phase5.claimReview')}
        body={decision === 'APPROVED' ? t('phase5.claimApproveConfirm') : reason}
        confirmLabel={t(decision === 'APPROVED' ? 'phase5.approve' : 'phase5.reject')}
        destructive={decision === 'REJECTED'}
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          setError('');
          const result = await postJson('/api/admin/loyalty/claims', { id: claim.id, decision, guestCount: Number(pax), reservationCount: Number(reservations), reason });
          setBusy(false);
          setDecision(null);
          if (!result.ok) setError(result.error.messageKey);
          else await reload();
        }}
      />
    </Card>
  );
}
