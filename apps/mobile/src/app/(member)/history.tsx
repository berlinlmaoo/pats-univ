import { formatDate, formatTime, type CheckInHistoryResponse } from '@pats/shared';
import { router } from 'expo-router';
import { History } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { useI18n } from '@/i18n';
import { useApi } from '@/lib/use-api';

/** Attendance history: every check-in with event, time and method (PRODUCT.md §5.1). */
export default function HistoryScreen() {
  const { t, locale } = useI18n();
  const { data, error, loading, refreshing, reload } = useApi<CheckInHistoryResponse>('/api/me/check-ins');

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={reload}>
      {loading ? (
        <Loading />
      ) : !data && error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data?.checkIns.length ? (
        <EmptyState icon={History} title={t('app.historyEmptyTitle')} body={t('app.historyEmptyBody')} />
      ) : (
        <Card style={styles.clip}>
          {data.checkIns.map((c, i) => {
            const tz = c.event.city.timezone;
            const at = new Date(c.checkedInAt);
            return (
              <ListRow
                key={c.id}
                first={i === 0}
                title={c.event.title}
                subtitle={[`${formatDate(at, locale, { timeZone: tz })}, ${formatTime(at, { timeZone: tz })}`, c.event.venueName]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<Badge label={t(`checkInMethod.${c.method}`)} />}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: c.event.id } })}
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
