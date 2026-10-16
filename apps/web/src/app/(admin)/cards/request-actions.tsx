'use client';

import { useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { decideReencodeAction } from '@/lib/hq/cards';

/** Approve (one encode within 24 hours, by the requester) or reject, with an optional note. */
export function RequestActions({ requestId, memberName, requester }: { requestId: string; memberName: string; requester: string }) {
  const t = useT();
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    setDeciding(null);
    setError(null);
  };
  const approve = deciding === 'approve';

  return (
    <div className="flex shrink-0 gap-2">
      <Button variant="secondary" size="sm" onClick={() => setDeciding('reject')}>
        {t('cards.reject')}
      </Button>
      <Button size="sm" onClick={() => setDeciding('approve')}>
        {t('cards.approve')}
      </Button>
      <Dialog
        open={deciding !== null}
        onClose={close}
        size="sm"
        title={approve ? t('cards.approveTitle', { name: memberName }) : t('cards.rejectTitle', { name: memberName })}
        description={approve ? t('cards.approveBody', { name: requester }) : t('cards.rejectBody', { name: requester })}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={approve ? 'primary' : 'danger'}
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await decideReencodeAction(requestId, approve, note);
                  if (res.ok) close();
                  else setError(t.loose(res.message ?? 'errors.generic', res.params));
                })
              }
            >
              {approve ? t('cards.approve') : t('cards.reject')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t('cards.decisionNote')} htmlFor={`note-${requestId}`} optionalLabel={t('common.optional')}>
            <Textarea id={`note-${requestId}`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
