'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { formatCount, formatDateTime, parseZonedDateTime, toZonedInput, type DrawDto } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { postJson } from '@/lib/client/api';
import { useRealtime } from '@/lib/client/realtime';

export function DrawPanel({ eventId }: { eventId: string }) {
  const t = useT();
  const state = useLoyalty<DrawDto>(`/api/loyalty/draw?eventId=${encodeURIComponent(eventId)}`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { reload } = state;
  useRealtime({ kind: 'draw', id: eventId }, reload);
  useEffect(() => { const timer = setInterval(() => void reload(), 15000); return () => clearInterval(timer); }, [reload]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dateTime = (key: string) => { const [date, time] = String(f.get(key)).split('T'); return parseZonedDateTime(date ?? '', time ?? '', 'Asia/Jakarta')?.toISOString(); };
    setBusy(true); setError('');
    const result = await postJson('/api/admin/draw', { action: 'configure', eventId, prize: f.get('prize'), peakStartsAt: dateTime('start'), peakEndsAt: dateTime('end'), capacity: f.get('capacity') ? Number(f.get('capacity')) : null });
    setBusy(false);
    if (!result.ok) setError(result.error.messageKey); else await state.reload();
  }
  if (!state.data || state.error) return <DataState error={state.error} reload={state.reload} />;
  const draw = state.data;
  const winner = draw.entries.find(e => e.id === draw.winnerEntryId);
  const local = (date: string | null) => { if (!date) return ''; const p = toZonedInput(new Date(date), 'Asia/Jakarta'); return `${p.date}T${p.time}`; };
  return <Card className="space-y-4 p-5">
    <h2 className="text-title2">{t('phase5.draw')}</h2>
    <p className="text-body-sm text-muted">{t('phase5.drawHint')}</p>
    {error && <p role="alert" className="text-danger-fg">{t.loose(error)}</p>}
    <p className="text-title3">{draw.prize ?? t('phase5.notConfigured')}</p>
    {draw.peakStartsAt && <p className="text-caption text-muted">{formatDateTime(new Date(draw.peakStartsAt), t.locale)} — {draw.peakEndsAt && formatDateTime(new Date(draw.peakEndsAt), t.locale)} · {formatCount(draw.costXp)} XP</p>}
    <DrawWheel draw={draw} />
    <ol className="space-y-2">{draw.entries.map(e => <li key={e.id} className={e.id === draw.winnerEntryId ? 'font-semibold text-accent-fg' : 'text-body-sm'}>{formatCount(e.position)}. {e.name}</li>)}</ol>
    {!draw.entries.length && <p className="text-muted">{t('phase5.drawEmpty')}</p>}
    {winner && <p role="status" className="text-title2">{t('phase5.drawWinner', { name: winner.name })}</p>}
    {!draw.startedAt && <Button disabled={busy || draw.entries.length !== draw.capacity} onClick={() => setConfirm(true)}>{t('phase5.drawRun')}</Button>}
    {!draw.startedAt && !draw.entries.length && <form className="grid gap-4 sm:grid-cols-2" onSubmit={save} key={`${eventId}:${draw.prize}`}>
      <Field htmlFor={`prize-${eventId}`} label={t('phase5.prize')}><Input id={`prize-${eventId}`} name="prize" required maxLength={200} defaultValue={draw.prize ?? ''} /></Field>
      <Field htmlFor={`capacity-${eventId}`} label={t('phase5.capacity')}><Input id={`capacity-${eventId}`} name="capacity" type="number" min={1} max={100} placeholder={String(draw.capacity)} /></Field>
      <Field htmlFor={`start-${eventId}`} label={t('phase5.peakStart')}><Input id={`start-${eventId}`} name="start" type="datetime-local" required defaultValue={local(draw.peakStartsAt)} /></Field>
      <Field htmlFor={`end-${eventId}`} label={t('phase5.peakEnd')}><Input id={`end-${eventId}`} name="end" type="datetime-local" required defaultValue={local(draw.peakEndsAt)} /></Field>
      <Button type="submit" loading={busy}>{t('common.save')}</Button>
    </form>}
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('phase5.drawRun')} body={t('phase5.drawConfirm')} confirmLabel={t('phase5.drawRun')} busy={busy} onConfirm={async () => {
      setBusy(true); const result = await postJson('/api/admin/draw', { action: 'run', eventId }); setBusy(false); setConfirm(false);
      if (!result.ok) setError(result.error.messageKey); else await state.reload();
    }} />
  </Card>;
}
function DrawWheel({ draw }: { draw: DrawDto }) {
  const entries = draw.entries;
  const index = entries.findIndex(e => e.id === draw.winnerEntryId);
  const angle = index < 0 ? 0 : 1440 + 360 - ((index + 0.5) * 360 / Math.max(1, entries.length));
  return <div className="mx-auto max-w-80" aria-label={draw.prize ?? ''}>
    <div className="mx-auto h-4 w-2 rounded-sm bg-accent" />
    <svg viewBox="0 0 240 240" role="img" aria-label={entries.map(e => e.name).join(', ')} className="w-full transition-transform duration-1000 motion-reduce:transition-none" style={{ transform: `rotate(${angle}deg)` }}>
      {entries.map((e, i) => {
        const start = i * 2 * Math.PI / entries.length - Math.PI / 2, end = (i + 1) * 2 * Math.PI / entries.length - Math.PI / 2;
        const mid = (start + end) / 2;
        return <g key={e.id}>
          {entries.length === 1 ? <circle cx="120" cy="120" r="112" className="fill-accent-subtle stroke-border-strong" /> : <path d={`M120 120L${120 + 112 * Math.cos(start)} ${120 + 112 * Math.sin(start)}A112 112 0 ${end-start > Math.PI ? 1 : 0} 1 ${120 + 112 * Math.cos(end)} ${120 + 112 * Math.sin(end)}Z`} className={i % 2 ? 'fill-accent-subtle stroke-border-strong' : 'fill-surface-muted stroke-border-strong'} />}
          <text x={120 + 65 * Math.cos(mid)} y={120 + 65 * Math.sin(mid)} textAnchor="middle" className="fill-fg text-caption">{e.position}</text>
        </g>;
      })}
      <circle cx="120" cy="120" r="20" className="fill-primary" />
    </svg>
  </div>;
}
