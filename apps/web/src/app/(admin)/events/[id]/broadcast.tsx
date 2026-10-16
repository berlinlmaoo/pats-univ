'use client';

import { formatCount } from '@pats/shared';
import { ImageUp, Megaphone } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { broadcastAction, uploadFlyerAction } from '@/lib/hq/cards';

/** Push the event to every member of the chosen cities (PRODUCT.md §5.3 Broadcast). */
export function BroadcastButton({
  eventId,
  eventCityId,
  cities,
  preview,
  disabled,
}: {
  eventId: string;
  eventCityId: string;
  cities: { id: string; name: string; members: number }[];
  /** The push as members of the event city will read it. */
  preview: { title: string; body: string };
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set([eventCityId]));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const recipients = cities.filter((c) => chosen.has(c.id)).reduce((n, c) => n + c.members, 0);
  const close = () => {
    setOpen(false);
    setResult(null);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? t('events.broadcastDraft') : undefined}>
        <Megaphone aria-hidden="true" />
        {t('events.broadcast')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('events.broadcastTitle')}
        description={t('events.broadcastBody')}
        footer={
          result?.ok ? (
            <Button onClick={close}>{t('common.close')}</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={pending}
                disabled={chosen.size === 0}
                onClick={() =>
                  start(async () => {
                    const res = await broadcastAction(eventId, [...chosen]);
                    setResult({ ok: res.ok, text: t.loose(res.message ?? 'errors.generic', 'params' in res ? res.params : undefined) });
                  })
                }
              >
                {t('events.broadcastSend', { count: formatCount(recipients) })}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-4">
          {result && <Alert tone={result.ok ? 'success' : 'danger'}>{result.text}</Alert>}
          <fieldset>
            <legend className="text-body-sm font-medium text-fg">{t('events.broadcastCities')}</legend>
            <div className="mt-2 flex flex-col gap-1">
              {cities.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 hover:bg-surface-hover">
                  <span className="flex items-center gap-2.5 text-body-sm text-fg">
                    <input
                      type="checkbox"
                      className="size-4 accent-accent"
                      checked={chosen.has(c.id)}
                      onChange={() =>
                        setChosen((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                    />
                    {c.name}
                  </span>
                  <span className="text-caption tabular-nums text-muted">{t('events.broadcastMembers', { count: formatCount(c.members) })}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="rounded-control border border-border bg-surface-muted px-3.5 py-3">
            <p className="text-label uppercase text-muted">{t('events.broadcastPreview')}</p>
            <p className="mt-1.5 text-body-sm font-semibold text-fg">{preview.title}</p>
            <p className="text-body-sm text-fg">{preview.body}</p>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Upload or replace the flyer members see on the event in the app. */
export function FlyerUpload({ eventId, hasFlyer }: { eventId: string; hasFlyer: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={t('events.flyerUpload')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.set('flyer', file);
          start(async () => {
            const res = await uploadFlyerAction(eventId, form);
            setMessage({ ok: res.ok, text: t.loose(res.message ?? 'errors.generic') });
            if (input.current) input.current.value = '';
          });
        }}
      />
      <Button variant="secondary" size="sm" className="self-start" loading={pending} onClick={() => input.current?.click()}>
        {!pending && <ImageUp aria-hidden="true" />}
        {hasFlyer ? t('events.flyerReplace') : t('events.flyerUpload')}
      </Button>
      <p className="text-caption text-muted">{t('events.flyerHint')}</p>
      {message && (
        <p role="status" className={message.ok ? 'text-caption text-success-fg' : 'text-caption text-danger-fg'}>
          {message.text}
        </p>
      )}
    </div>
  );
}
