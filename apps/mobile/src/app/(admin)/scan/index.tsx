import type { EventListResponse } from '@pats/shared';
import { router } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { EventRow } from '@/features/event-ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';

/** Which event are we scanning for? With exactly one open event, go straight to the camera. */
export default function ScanPickScreen() {
  const t = useT();
  const { data, error, loading, refreshing, reload } = useApi<EventListResponse>('/api/admin/events');
  const open = data?.upcoming.filter((e) => e.phase === 'open') ?? [];
  const jumped = useRef(false);
  const scan = (eventId: string) => router.push({ pathname: '/scan/[eventId]', params: { eventId } });

  useEffect(() => {
    if (jumped.current || !data) return;
    jumped.current = true;
    const only = data.upcoming.filter((e) => e.phase === 'open');
    if (only.length === 1) router.replace({ pathname: '/scan/[eventId]', params: { eventId: only[0]!.id } });
  }, [data]);

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={reload}>
      {loading ? (
        <Loading />
      ) : !data && error ? (
        <LoadError error={error} onRetry={reload} />
      ) : open.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title={t('app.scanNoOpenTitle')}
          body={t('app.scanNoOpenBody')}
          action={<Button variant="secondary" label={t('app.scanGoToEvents')} onPress={() => router.replace('/city-events')} />}
        />
      ) : (
        <>
          <Text variant="bodySm" tone="textMuted">
            {t('app.scanPickBody')}
          </Text>
          <Card style={styles.clip}>
            {open.map((e, i) => (
              <EventRow key={e.id} crew event={e} first={i === 0} onPress={() => scan(e.id)} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
