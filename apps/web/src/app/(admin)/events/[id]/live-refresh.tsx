'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useT } from '@/components/i18n/provider';

export const LIVE_REFRESH_SECONDS = 10;

/** While check-in is open the attendance list refreshes itself (realtime arrives in Phase 4). */
export function LiveRefresh() {
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, LIVE_REFRESH_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [router]);
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {t('events.live', { seconds: LIVE_REFRESH_SECONDS })}
    </span>
  );
}
