'use client';

import { REASON_MIN } from '@pats/shared';
import { Ban } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { revokeCardAction } from '@/lib/hq/cards';

/** Lost, damaged or misprinted: revoke the card and queue a replacement. Reason required. */
export function RevokeCardButton({ cardId, memberName, compact }: { cardId: string; memberName: string; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    setOpen(false);
    setError(null);
  };
  const tooShort = reason.trim().length < REASON_MIN;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={compact ? t('cards.revokeFor', { name: memberName }) : undefined}>
        <Ban aria-hidden="true" />
        {!compact && t('cards.revoke')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        size="sm"
        title={t('cards.revokeTitle', { name: memberName })}
        description={t('cards.revokeBody')}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              disabled={tooShort}
              onClick={() =>
                start(async () => {
                  const res = await revokeCardAction(cardId, reason);
                  if (res.ok) {
                    close();
                    setReason('');
                  } else setError(t.loose(res.fields?.reason ?? res.message ?? 'errors.generic', res.params));
                })
              }
            >
              {t('cards.revoke')}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t('cards.revokeReason')} htmlFor={`revoke-${cardId}`} hint={t('cards.revokeReasonHint')}>
            <Input id={`revoke-${cardId}`} value={reason} maxLength={200} autoFocus placeholder={t('cards.revokeReasonPlaceholder')} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </form>
      </Dialog>
    </>
  );
}
