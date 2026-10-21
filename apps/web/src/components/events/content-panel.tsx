'use client';

import { EVENT_DESCRIPTION_MAX, formatDateTime, type ContentSubmissionInfo } from '@pats/shared';
import { ImageUp } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/field';
import { decideContentAction, saveEventContentAction } from '@/lib/hq/content';

/**
 * Poster & description of an event (UX redesign D5). HQ edits go live at once; a regional admin's
 * edit is sent to HQ and members keep seeing the approved version until HQ approves.
 */
export function ContentPanel({
  eventId,
  eventTitle,
  live,
  mode,
  pending,
  canDecide,
}: {
  eventId: string;
  eventTitle: string;
  live: { url: string | null; description: string };
  mode: 'direct' | 'approval';
  pending: ContentSubmissionInfo | null;
  canDecide: boolean;
}) {
  const t = useT();
  const file = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingSave, start] = useTransition();

  return (
    <Card>
      <CardHeader title={t('ux.content.title')} description={t(mode === 'direct' ? 'ux.content.directHint' : 'ux.content.approvalHint')} className="pb-3" />
      <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
        <div>
          <p className="ktm-label text-muted">{t('ux.content.live')}</p>
          {live.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own storage route
            <img src={live.url} alt={t('events.flyerAlt', { title: eventTitle })} className="mt-2 max-h-72 w-full rounded-control border border-border object-contain" />
          ) : (
            <p className="mt-1 text-body-sm text-muted">{t('events.flyerEmpty')}</p>
          )}
          {live.description && <p className="mt-2 whitespace-pre-line break-words text-body-sm text-fg">{live.description}</p>}
        </div>

        {pending && <PendingSubmission submission={pending} eventTitle={eventTitle} canDecide={canDecide} onDone={(m) => setMessage(m)} />}

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            start(async () => {
              const res = await saveEventContentAction(eventId, form);
              setMessage({ ok: res.ok, text: t.loose(res.message ?? 'errors.generic') });
              if (res.ok && file.current) {
                file.current.value = '';
                setFileName('');
              }
            });
          }}
        >
          <Field htmlFor={`content-${eventId}`} label={t('ux.content.descriptionLabel')}>
            <Textarea id={`content-${eventId}`} name="description" maxLength={EVENT_DESCRIPTION_MAX} defaultValue={pending?.description ?? live.description} className="min-h-28" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={file}
              type="file"
              name="poster"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label={t('ux.content.posterLabel')}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => file.current?.click()}>
              <ImageUp aria-hidden="true" />
              {live.url ? t('events.flyerReplace') : t('events.flyerUpload')}
            </Button>
            {fileName && <span className="min-w-0 truncate text-caption text-muted">{fileName}</span>}
          </div>
          <p className="text-caption text-muted">{t('events.flyerHint')}</p>
          {mode === 'approval' && pending && <p className="text-caption text-muted">{t('ux.content.replacesPending')}</p>}
          <Button type="submit" className="self-start" loading={pendingSave}>
            {t(mode === 'direct' ? 'ux.content.save' : 'ux.content.submit')}
          </Button>
        </form>
        {message && (
          <p role="status" className={message.ok ? 'text-caption text-success-fg' : 'text-caption text-danger-fg'}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}

/** A waiting submission: what changes, who sent it, and (for HQ) Approve / Reject. */
export function PendingSubmission({
  submission,
  eventTitle,
  canDecide,
  onDone,
}: {
  submission: ContentSubmissionInfo;
  eventTitle: string;
  canDecide: boolean;
  onDone?: (m: { ok: boolean; text: string }) => void;
}) {
  const t = useT();
  const [note, setNote] = useState('');
  const [busy, start] = useTransition();
  const [error, setError] = useState('');
  const decide = (decision: 'APPROVED' | 'REJECTED') =>
    start(async () => {
      const res = await decideContentAction(submission.id, decision, note);
      if (!res.ok) setError(t.loose(res.message ?? 'errors.generic'));
      else onDone?.({ ok: true, text: t.loose(res.message ?? 'common.saved') });
    });
  return (
    <div className="rounded-control border border-border bg-surface-muted px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone="warning" dot>
          {t('ux.content.pending')}
        </Badge>
        <span className="text-caption text-muted">{t('ux.content.by', { name: submission.submittedBy, date: formatDateTime(new Date(submission.submittedAt), t.locale) })}</span>
      </div>
      {submission.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- staff-only preview route
        <img src={submission.posterUrl} alt={t('events.flyerAlt', { title: eventTitle })} className="mt-3 max-h-60 w-full rounded-control border border-border object-contain" />
      )}
      {submission.description !== null && <p className="mt-3 whitespace-pre-line break-words text-body-sm text-fg">{submission.description || '—'}</p>}
      {canDecide && (
        <div className="mt-3 flex flex-col gap-2">
          <Field htmlFor={`note-${submission.id}`} label={t('ux.content.rejectReason')} hint={t('ops.rejectReasonHint')}>
            <Textarea id={`note-${submission.id}`} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy} onClick={() => decide('APPROVED')}>
              {t('ux.content.approve')}
            </Button>
            <Button size="sm" variant="danger" disabled={busy || note.trim().length < 3} onClick={() => decide('REJECTED')}>
              {t('ux.content.reject')}
            </Button>
          </div>
          {error && <p role="alert" className="text-caption text-danger-fg">{error}</p>}
        </div>
      )}
    </div>
  );
}
