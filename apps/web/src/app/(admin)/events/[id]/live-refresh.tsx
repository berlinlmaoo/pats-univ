
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/provider';
import { useRealtime } from '@/lib/client/realtime';
export function LiveRefresh({ eventId }: { eventId?: string }) {
  const t = useT(); const router = useRouter();
  const live = useRealtime(eventId ? { kind: 'attendance', id: eventId } : null, () => router.refresh());
  useEffect(() => { if (eventId) return; const timer = setInterval(() => router.refresh(), 10000); return () => clearInterval(timer); }, [eventId, router]);
  return <span className="text-caption text-muted">{eventId ? t(live ? 'social.live' : 'social.offline') : t('events.live', { seconds: 10 })}</span>;
}
