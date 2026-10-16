'use client';

import type { EventAction, EventPhase } from '@pats/shared';
import { useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { eventTransitionAction } from '@/lib/hq/events';

/** The one next step for an event: publish a draft, open check-in, or close it. */
export function EventActions({
  eventId,
  phase,
  cityName,
  opensAtLabel,
  closesAtLabel,
  opensEarly,
}: {
  eventId: string;
  phase: EventPhase;
  cityName: string;
  opensAtLabel: string;
  closesAtLabel: string;
  /** Opening now would start the window before its planned time. */
  opensEarly: boolean;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState<EventAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const action: EventAction | null =
    phase === 'draft' ? 'publish' : phase === 'open' ? 'close' : phase === 'upcoming' || phase === 'closed' ? 'open' : null;
  if (!action) return null;

  const copy = {
    publish: { label: t('events.actionPublish'), title: t('events.publishTitle'), body: t('events.publishBody', { city: cityName }) },
    open: {
      label: t('events.actionOpen'),
      title: t('events.openTitle'),
      body: opensEarly ? t('events.openEarlyBody', { time: opensAtLabel }) : t('events.openBody', { time: closesAtLabel }),
    },
    close: { label: t('events.actionClose'), title: t('events.closeTitle'), body: t('events.closeBody') },
  }[action];

  const close = () => {
    setConfirming(null);
    setError(null);
  };

  return (
    <>
      <Button variant={action === 'close' ? 'secondary' : 'primary'} onClick={() => setConfirming(action)}>
        {copy.label}
      </Button>
      <Dialog
        open={confirming !== null}
        onClose={close}
        size="sm"
        title={copy.title}
        description={copy.body}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={action === 'close' ? 'danger' : 'primary'}
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await eventTransitionAction(eventId, action);
                  if (res.ok) close();
                  else setError(t.loose(res.message ?? 'errors.generic'));
                })
              }
            >
              {copy.label}
            </Button>
          </>
        }
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Dialog>
    </>
  );
}
