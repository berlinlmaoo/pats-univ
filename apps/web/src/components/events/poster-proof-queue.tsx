'use client';

import { formatDateTime, type PosterProofInfo } from '@pats/shared';
import { ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Textarea } from '@/components/ui/field';
import { postJson } from '@/lib/client/api';

type QueueProof = PosterProofInfo & {
  member: { id: string; fullName: string; nim: string };
  event: { id: string; title: string; city: string; startsAt: string };
  reviewedBy: string | null;
  rewardXp: number;
};

/** Blast-poster proofs waiting for crew review (22 Oct). Approval adds the poster-share XP once. */
export function PosterProofQueue() {
  const t = useT();
  const state = useLoyalty<{ proofs: QueueProof[] }>('/api/admin/poster-proofs?status=PENDING');
  const [notice, setNotice] = useState('');
  if (!state.data || state.error) return <DataState error={state.error} reload={state.reload} />;
  const list = state.data.proofs;
  return (
    <section className="space-y-3" aria-labelledby="proof-queue-title">
      <h2 id="proof-queue-title" className="sr-only">{t('ux.posterProof.queueTitle')}</h2>
      {notice && <p role="status" className="text-body-sm text-success-fg">{notice}</p>}
      {!list.length ? (
        <Card>
          <EmptyState icon={ImageIcon} title={t('ux.posterProof.queueEmpty')} body={t('ux.posterProof.queueEmptyBody')} />
        </Card>
      ) : (
        list.map((p) => <ProofCard key={p.id} proof={p} onDone={(text) => { setNotice(text); void state.reload(); }} />)
      )}
    </section>
  );
}

function ProofCard({ proof, onDone }: { proof: QueueProof; onDone: (text: string) => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    setBusy(true);
    setError('');
    const res = await postJson(`/api/admin/poster-proofs/${proof.id}/decision`, { decision, reason });
    setBusy(false);
    if (!res.ok) setError(t.loose(res.error.messageKey));
    else onDone(t(decision === 'APPROVED' ? 'ux.posterProof.approved' : 'ux.posterProof.rejected'));
  };
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-title3 text-fg">{proof.member.fullName}</h3>
          <p className="mt-0.5 break-words text-body-sm text-muted">
            <Link href={`/events/${proof.event.id}`} className="underline-offset-2 hover:underline">{proof.event.title}</Link> · {proof.event.city} · {formatDateTime(new Date(proof.submittedAt), t.locale)}
          </p>
        </div>
        <Badge tone="warning" dot>{t('ux.posterProof.statusPENDING')}</Badge>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, crew-only route */}
      <img src={proof.imageUrl} alt={t('ux.posterProof.queueTitle')} className="max-h-96 w-full rounded-control border border-border object-contain" />
      <Field htmlFor={`proof-${proof.id}`} label={t('ux.posterProof.reason')} hint={t('ops.rejectReasonHint')}>
        <Textarea id={`proof-${proof.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} onClick={() => decide('APPROVED')}>{t('ux.posterProof.approve', { xp: proof.rewardXp })}</Button>
        <Button size="sm" variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => decide('REJECTED')}>{t('ux.posterProof.reject')}</Button>
      </div>
      {error && <p role="alert" className="text-caption text-danger-fg">{error}</p>}
    </Card>
  );
}
