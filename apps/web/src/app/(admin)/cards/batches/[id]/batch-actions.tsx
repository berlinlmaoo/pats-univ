'use client';

import { formatCount, type BatchAction } from '@pats/shared';
import { RefreshCw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/field';
import { batchActionAction, cancelBatchAction, regenerateFilesAction, saveVendorNoteAction } from '@/lib/hq/cards';

/** The batch's one manual next step (to vendor → back at HQ → shipped), plus cancel while new. */
export function BatchActions({
  batchId,
  label,
  action,
  canCancel,
  filesReady,
  remaining,
  cityName,
}: {
  batchId: string;
  label: string;
  action: BatchAction | null;
  canCancel: boolean;
  filesReady: boolean;
  remaining: number;
  cityName: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<BatchAction | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    setOpen(null);
    setError(null);
  };

  const copy: Record<BatchAction, { label: string; title: string; body: string }> = {
    sendToVendor: { label: t('cards.actionSend'), title: t('cards.sendTitle', { label }), body: t('cards.sendBody') },
    receiveAtHq: { label: t('cards.actionReceive'), title: t('cards.receiveTitle', { label }), body: t('cards.receiveBody') },
    shipToCity: {
      label: t('cards.actionShip'),
      title: t('cards.shipTitle', { label, city: cityName }),
      body: remaining > 0 ? t('cards.shipBlocked', { count: formatCount(remaining) }) : t('cards.shipBody', { city: cityName }),
    },
  };
  const blocked = (action === 'sendToVendor' && !filesReady) || (action === 'shipToCity' && remaining > 0);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {canCancel && (
        <Button variant="ghost" onClick={() => setOpen('cancel')}>
          {t('cards.cancelBatch')}
        </Button>
      )}
      {action && (
        <Button onClick={() => setOpen(action)} disabled={action === 'sendToVendor' && !filesReady}>
          {copy[action].label}
        </Button>
      )}
      {action && (
        <Dialog
          open={open === action}
          onClose={close}
          size="sm"
          title={copy[action].title}
          description={copy[action].body}
          footer={
            <>
              <Button variant="secondary" onClick={close} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={pending}
                disabled={blocked}
                onClick={() =>
                  start(async () => {
                    const res = await batchActionAction(batchId, action);
                    if (res.ok) close();
                    else setError(t.loose(res.message ?? 'errors.generic', res.params));
                  })
                }
              >
                {copy[action].label}
              </Button>
            </>
          }
        >
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </Dialog>
      )}
      <ConfirmDialog
        open={open === 'cancel'}
        onClose={close}
        title={t('cards.cancelTitle', { label })}
        body={t('cards.cancelBody')}
        confirmLabel={t('cards.cancelBatch')}
        destructive
        busy={pending}
        onConfirm={() =>
          start(async () => {
            const res = await cancelBatchAction(batchId);
            if (res && !res.ok) setError(t.loose(res.message ?? 'errors.generic'));
          })
        }
      />
    </div>
  );
}

export function RegenerateFiles({ batchId, hasFiles }: { batchId: string; hasFiles: boolean }) {
  const t = useT();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={hasFiles ? 'ghost' : 'primary'}
        loading={pending}
        className="self-start"
        onClick={() =>
          start(async () => {
            const res = await regenerateFilesAction(batchId);
            setMessage({ ok: res.ok, text: t.loose(res.message ?? 'errors.generic') });
          })
        }
      >
        {!pending && <RefreshCw aria-hidden="true" />}
        {pending ? t('cards.generating') : hasFiles ? t('cards.regenerate') : t('cards.generate')}
      </Button>
      {message && (
        <p role="status" className={message.ok ? 'text-caption text-success-fg' : 'text-caption text-danger-fg'}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export function VendorNote({ batchId, initial }: { batchId: string; initial: string }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await saveVendorNoteAction(batchId, value);
          setSaved(true);
        });
      }}
    >
      <label htmlFor={`vendor-${batchId}`} className="sr-only">
        {t('cards.vendorNote')}
      </label>
      <Textarea
        id={`vendor-${batchId}`}
        value={value}
        maxLength={500}
        placeholder={t('cards.vendorNotePlaceholder')}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className="min-h-20"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={value === initial && !saved}>
          {t('common.save')}
        </Button>
        {saved && !pending && (
          <span role="status" className="text-caption text-success-fg">
            {t('common.saved')}
          </span>
        )}
      </div>
    </form>
  );
}
