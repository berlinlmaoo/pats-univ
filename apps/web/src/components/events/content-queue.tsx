'use client';

import type { ContentSubmissionInfo } from '@pats/shared';
import { ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { DataState, useLoyalty } from '@/components/loyalty/state';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PendingSubmission } from './content-panel';

/** HQ: regional posters/descriptions waiting for approval (D5), oldest first. */
export function ContentQueue() {
  const t = useT();
  const state = useLoyalty<{ submissions: ContentSubmissionInfo[] }>('/api/admin/content-submissions?status=PENDING');
  const [notice, setNotice] = useState('');
  if (!state.data || state.error) return <DataState error={state.error} reload={state.reload} />;
  const list = state.data.submissions;
  return (
    <section className="space-y-3" aria-labelledby="content-queue-title">
      <h2 id="content-queue-title" className="sr-only">{t('ux.content.queueTitle')}</h2>
      {notice && <p role="status" className="text-body-sm text-success-fg">{notice}</p>}
      {!list.length ? (
        <Card>
          <EmptyState icon={ImageIcon} title={t('ux.content.queueEmpty')} body={t('ux.content.queueEmptyBody')} />
        </Card>
      ) : (
        list.map((s) => (
          <Card key={s.id} className="space-y-3 p-5">
            <div className="min-w-0">
              <Link href={`/events/${s.eventId}`} className="break-words text-title3 text-fg underline-offset-2 hover:underline">
                {s.eventTitle}
              </Link>
              <p className="mt-0.5 text-body-sm text-muted">{s.city.name}</p>
            </div>
            <PendingSubmission
              submission={s}
              eventTitle={s.eventTitle}
              canDecide
              onDone={(m) => {
                setNotice(m.text);
                void state.reload();
              }}
            />
          </Card>
        ))
      )}
    </section>
  );
}
