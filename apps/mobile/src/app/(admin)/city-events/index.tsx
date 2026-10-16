import type { EventListResponse } from '@pats/shared';
import { router, Stack } from 'expo-router';
import { CalendarDays, Plus } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { LoadError, Loading } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { EventRow } from '@/features/event-ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';

export default function AdminEventsScreen() {
  const t = useT();
  const { me } = useAuth();
  const city = me?.user.city?.name ?? '';
  const { data, error, loading, refreshing, reload } = useApi<EventListResponse>('/api/admin/events');
  const open = (id: string) => router.push({ pathname: '/city-events/[id]', params: { id } });
  const create = () => router.push('/city-events/new');

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={reload}>
      <Stack.Screen options={{ headerRight: () => <HeaderButton icon={Plus} label={t('app.adminNewEvent')} onPress={create} /> }} />
      {data && error?.code === 'NETWORK' && <Notice tone="danger" text={t('app.offlineBody')} />}
      {loading ? (
        <Loading />
      ) : !data && error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data || (data.upcoming.length === 0 && data.past.length === 0) ? (
        <EmptyState
          icon={CalendarDays}
          title={t('app.adminEventsEmptyTitle')}
          body={t('app.adminEventsEmptyBody', { city })}
          action={<Button label={t('app.adminNewEvent')} onPress={create} />}
        />
      ) : (
        <>
          {data.upcoming.length > 0 && (
            <>
              <SectionLabel>{t('app.eventsUpcoming')}</SectionLabel>
              <Card style={styles.clip}>
                {data.upcoming.map((e, i) => (
                  <EventRow key={e.id} crew event={e} first={i === 0} onPress={() => open(e.id)} />
                ))}
              </Card>
            </>
          )}
          {data.past.length > 0 && (
            <>
              <SectionLabel>{t('app.eventsPast')}</SectionLabel>
              <Card style={styles.clip}>
                {data.past.map((e, i) => (
                  <EventRow key={e.id} crew event={e} first={i === 0} onPress={() => open(e.id)} />
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
