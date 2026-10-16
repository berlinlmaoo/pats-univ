import { formatCount, type CheckInHistoryResponse, type NotificationListResponse } from '@pats/shared';
import { router } from 'expo-router';
import { Bell, History, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { CardQr } from '@/features/card-qr';
import { CARD_TONE } from '@/features/card-status';
import { KtmCard } from '@/features/ktm-card';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';
import { space } from '@/theme';

export default function CardScreen() {
  const { me, offline, reload } = useAuth();
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const member = me?.member;
  const history = useApi<CheckInHistoryResponse>(member ? '/api/me/check-ins' : null);
  const inbox = useApi<NotificationListResponse>('/api/me/notifications');
  const unread = inbox.data?.unread ?? 0;
  const firstName = (member?.fullName ?? me?.user.name ?? '').split(' ')[0] ?? '';
  const attended = history.data?.checkIns.length ?? 0;

  return (
    <Screen
      title={t('app.greeting', { name: firstName })}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([reload(), history.reload(), inbox.reload()]);
        setRefreshing(false);
      }}
    >
      {offline && <Notice tone="danger" text={t('app.offlineBody')} />}
      {!member ? (
        <EmptyState icon={UserRound} title={t('app.cardTitle')} body={t('app.noMemberProfile')} />
      ) : (
        <>
          <KtmCard member={member} />
          {/* Where the physical card is, right under the digital one (visible without scrolling). */}
          <Card style={styles.status}>
            <Text variant="body" weight={500} style={styles.flex}>
              {t('app.physicalCard')}
            </Text>
            <Badge dot tone={CARD_TONE[member.cardStatus]} label={t(`cardStatusMember.${member.cardStatus}`)} />
          </Card>
          <CardQr />
          <Card style={styles.clip}>
            <ListRow
              first
              icon={History}
              title={t('app.attendanceRow')}
              subtitle={history.data ? (attended ? t('app.attendanceCount', { count: formatCount(attended) }) : t('app.attendanceNone')) : undefined}
              onPress={() => router.push('/history')}
            />
            <ListRow
              icon={Bell}
              title={t('app.notificationsTitle')}
              subtitle={inbox.data ? (unread ? t('app.notificationsUnread', { count: formatCount(unread) }) : t('app.notificationsNone')) : undefined}
              trailing={unread ? <Badge tone="accent" label={formatCount(unread)} /> : undefined}
              onPress={() => router.push('/notifications')}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  flex: { flexShrink: 1 },
  clip: { overflow: 'hidden' },
});
