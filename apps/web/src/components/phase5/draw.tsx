'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Trophy } from 'lucide-react';
import { formatCount, formatDateTime, parseZonedDateTime, toZonedInput, type DrawDto } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DateTimeInput } from '@/components/ui/date-time';
import { Field, Input } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { postJson } from '@/lib/client/api';
import { useRealtime } from '@/lib/client/realtime';
import { cn } from '@/lib/cn';

/**
 * Live prize draw on the event page (admin). Before the event: set prize + peak hour, watch the
 * slots fill, run the draw once. After the event: a read-only summary (winner or "not run").
 */
export function DrawPanel({ eventId, ended = false }: { eventId: string; ended?: boolean }) {
  const t = useT();
  const state = useLoyalty<DrawDto>(`/api/loyalty/draw?eventId=${encodeURIComponent(eventId)}`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { reload } = state;
  useRealtime({ kind: 'draw', id: eventId }, reload);
  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => void reload(), 15000);
    return () => clearInterval(timer);
  }, [reload, ended]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dateTime = (key: string) => {
      const [date, time] = String(f.get(key)).split('T');
      return parseZonedDateTime(date ?? '', time ?? '', 'Asia/Jakarta')?.toISOString();
    };
    const peakStartsAt = dateTime('start'), peakEndsAt = dateTime('end');
    if (!peakStartsAt || !peakEndsAt) {
      setError('validation.dateInvalid');
      return;
    }
    setBusy(true);
    setError('');
    const result = await postJson('/api/admin/draw', { action: 'configure', eventId, prize: f.get('prize'), peakStartsAt, peakEndsAt, capacity: f.get('capacity') ? Number(f.get('capacity')) : null });
    setBusy(false);
    if (!result.ok) setError(result.error.messageKey);
    else await state.reload();
  }
  if (!state.data || state.error) {
    return (
      <Card>
        <DataState error={state.error} reload={state.reload} />
      </Card>
    );
  }
  const draw = state.data;
  const winner = draw.entries.find((e) => e.id === draw.winnerEntryId);
  const local = (date: string | null) => {
    if (!date) return '';
    const p = toZonedInput(new Date(date), 'Asia/Jakarta');
    return `${p.date}T${p.time}`;
  };
  const full = draw.entries.length >= draw.capacity;
  const canConfigure = !ended && !draw.startedAt && !draw.entries.length;
  const status = draw.startedAt ? (
    <Badge tone="success" dot>{t('ops.drawDone')}</Badge>
  ) : ended ? (
    <Badge tone="neutral" dot>{t('ops.drawNotRun')}</Badge>
  ) : full ? (
    <Badge tone="accent" dot>{t('phase5.drawFull')}</Badge>
  ) : (
    <Badge tone="warning" dot>{t('ops.drawOpenSlots', { count: formatCount(draw.capacity - draw.entries.length) })}</Badge>
  );

  return (
    <Card>
      <CardHeader title={t('phase5.draw')} description={ended ? t('ops.drawArchive') : t('ops.drawAdminHint')} action={status} />
      <div className="space-y-5 p-5">
        {error && <p role="alert" className="text-body-sm text-danger-fg">{t.loose(error)}</p>}
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <dt className="ktm-label text-muted">{t('phase5.prize')}</dt>
            <dd className={cn('mt-1 break-words', draw.prize ? 'text-title3 text-fg' : 'text-body-sm text-muted')}>{draw.prize ?? t('ops.drawNoPrize')}</dd>
          </div>
          <div className="sm:col-span-1">
            <dt className="ktm-label text-muted">{t('ops.peakHour')}</dt>
            <dd className="mt-1 text-body-sm text-fg">
              {draw.peakStartsAt && draw.peakEndsAt
                ? `${formatDateTime(new Date(draw.peakStartsAt), t.locale)} – ${formatDateTime(new Date(draw.peakEndsAt), t.locale)}`
                : <span className="text-muted">{t('common.notSet')}</span>}
            </dd>
          </div>
          <div>
            <dt className="ktm-label text-muted">{t('ops.slotCost')}</dt>
            <dd className="mt-1 text-body-sm tabular-nums text-fg">{formatCount(draw.costXp)} XP</dd>
          </div>
        </dl>

        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5" aria-label={t('ops.drawSlots')}>
          {Array.from({ length: draw.capacity }, (_, i) => {
            const entry = draw.entries.find((e) => e.position === i + 1);
            const won = !!entry && entry.id === draw.winnerEntryId;
            return (
              <li
                key={i}
                className={cn(
                  'flex min-h-16 items-center gap-3 rounded-control border px-3 py-2.5 sm:flex-col sm:items-start sm:gap-1',
                  won ? 'border-gold bg-band text-band-fg gold-rule' : entry ? 'border-border bg-surface' : 'border-dashed border-border-strong/60 bg-transparent',
                )}
              >
                <span className={cn('ktm-label tabular-nums', won ? 'text-gold' : 'text-muted')}>{t('ops.slotN', { n: i + 1 })}</span>
                <span className={cn('min-w-0 break-words text-body-sm', entry ? 'font-semibold' : 'text-muted')}>
                  {entry ? entry.name : t('ops.slotEmpty')}
                </span>
              </li>
            );
          })}
        </ol>

        {winner && (
          <p role="status" className="flex items-center gap-2 text-title3 text-fg">
            <Trophy className="size-5 text-gold-fg" strokeWidth={1.75} aria-hidden="true" />
            {t('phase5.drawWinner', { name: winner.name })}
          </p>
        )}
        {!ended && !draw.startedAt && !draw.entries.length && <p className="text-body-sm text-muted">{t('phase5.drawEmpty')}</p>}
        {ended && !draw.startedAt && <p className="text-body-sm text-muted">{t('ops.drawNotRunBody')}</p>}

        {!ended && !draw.startedAt && draw.entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || !full || !draw.prize} onClick={() => setConfirm(true)}>
              {t('phase5.drawRun')}
            </Button>
            {(!full || !draw.prize) && <p className="text-caption text-muted">{t('phase5.drawNotReady')}</p>}
          </div>
        )}

        {canConfigure && (
          <form className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2" onSubmit={save} key={`${eventId}:${draw.prize}`}>
            <Field htmlFor={`prize-${eventId}`} label={t('phase5.prize')}>
              <Input id={`prize-${eventId}`} name="prize" required maxLength={200} defaultValue={draw.prize ?? ''} />
            </Field>
            <Field htmlFor={`capacity-${eventId}`} label={t('phase5.capacity')}>
              <Input id={`capacity-${eventId}`} name="capacity" type="number" inputMode="numeric" min={1} max={100} placeholder={String(draw.capacity)} />
            </Field>
            <Field htmlFor={`start-${eventId}`} label={t('phase5.peakStart')}>
              <DateTimeInput id={`start-${eventId}`} name="start" required defaultValue={local(draw.peakStartsAt)} />
            </Field>
            <Field htmlFor={`end-${eventId}`} label={t('phase5.peakEnd')}>
              <DateTimeInput id={`end-${eventId}`} name="end" required defaultValue={local(draw.peakEndsAt)} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy}>{t('common.save')}</Button>
            </div>
          </form>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('phase5.drawRun')}
        body={t('phase5.drawConfirm')}
        confirmLabel={t('phase5.drawRun')}
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          const result = await postJson('/api/admin/draw', { action: 'run', eventId });
          setBusy(false);
          setConfirm(false);
          if (!result.ok) setError(result.error.messageKey);
          else await state.reload();
        }}
      />
    </Card>
  );
}
