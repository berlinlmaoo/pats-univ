import type { EventListResponse } from '@pats/shared';
import { router } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadError, Loading } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { EventRow } from '@/features/event-ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';

export default function EventsScreen() {
  const t = useT();
  const { me } = useAuth();
  const city = me?.member?.city.name ?? me?.user.city?.name ?? '';
  const { data, error, loading, refreshing, reload } = useApi<EventListResponse>('/api/events');
  const open = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

  return (
    <Screen title={t('app.tabEvents')} refreshing={refreshing} onRefresh={reload}>
      {data && error?.code === 'NETWORK' && <Notice tone="danger" text={t('app.offlineBody')} />}
      {loading ? (
        <Loading />
      ) : !data && error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data || (data.upcoming.length === 0 && data.past.length === 0) ? (
        <EmptyState icon={CalendarDays} title={t('app.eventsEmptyTitle')} body={t('app.eventsEmptyBody', { city })} />
      ) : (
        <>
          {data.upcoming.length > 0 && (
            <>
              <SectionLabel>{t('app.eventsUpcoming')}</SectionLabel>
              <Card style={styles.clip}>
                {data.upcoming.map((e, i) => (
                  <EventRow key={e.id} event={e} first={i === 0} onPress={() => open(e.id)} />
                ))}
              </Card>
            </>
          )}
          {data.upcoming.length === 0 && (
            <EmptyState icon={CalendarDays} title={t('app.eventsEmptyTitle')} body={t('app.eventsEmptyBody', { city })} />
          )}
          {data.past.length > 0 && (
            <>
              <SectionLabel>{t('app.eventsPast')}</SectionLabel>
              <Card style={styles.clip}>
                {data.past.map((e, i) => (
                  <EventRow key={e.id} event={e} first={i === 0} onPress={() => open(e.id)} />
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
