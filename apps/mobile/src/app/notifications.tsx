import { formatDate, formatTime, type NotificationListResponse } from '@pats/shared';
import { router, Stack } from 'expo-router';
import { Bell, Settings2 } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { hrefFor } from '@/lib/push';
import { useApi } from '@/lib/use-api';
import { size, space, useColors } from '@/theme';

/** The notification centre (PRODUCT.md §8): every push is kept here, newest first. */
export default function NotificationsScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { call } = useAuth();
  const list = useApi<NotificationListResponse>('/api/me/notifications');
  const unread = list.data?.unread ?? 0;

  // Opening the centre reads what's in it (the dots stay for this visit).
  useEffect(() => {
    if (unread > 0) void call('POST', '/api/me/notifications/read', { all: true }).catch(() => null);
  }, [call, unread]);

  return (
    <Screen edges={['bottom']} refreshing={list.refreshing} onRefresh={() => void list.reload()}>
      <Stack.Screen options={{ headerRight: () => <HeaderButton icon={Settings2} label={t('app.notificationSettingsTitle')} onPress={() => router.push('/notification-settings')} /> }} />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <LoadError error={list.error} onRetry={() => void list.reload()} />
      ) : list.data!.notifications.length === 0 ? (
        <EmptyState icon={Bell} title={t('app.notificationsEmptyTitle')} body={t('app.notificationsEmptyBody')} />
      ) : (
        <Card style={styles.clip}>
          {list.data!.notifications.map((n, i) => {
            const href = hrefFor(n.data);
            const when = new Date(n.sentAt);
            return (
              <Pressable
                key={n.id}
                disabled={!href}
                onPress={() => href && router.push(href)}
                accessibilityRole={href ? 'button' : 'text'}
                accessibilityLabel={`${n.readAt ? '' : `${t('app.notificationUnread')}. `}${n.title}. ${n.body}`}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && { backgroundColor: c.surfaceHover }]}
              >
                <View style={[styles.dot, { backgroundColor: n.readAt ? 'transparent' : c.accent }]} />
                <View style={styles.flex}>
                  <Text variant="body" weight={600}>
                    {n.title}
                  </Text>
                  <Text variant="bodySm" tone="textMuted">
                    {n.body}
                  </Text>
                  <Text variant="caption" tone="textMuted" style={styles.time}>
                    {`${formatDate(when, t.locale)}, ${formatTime(when)}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  row: { flexDirection: 'row', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], minHeight: size.touch + space[4] },
  dot: { width: size.dot, height: size.dot, borderRadius: size.dot / 2, marginTop: space[2] },
  flex: { flex: 1, gap: space[0.5] },
  time: { marginTop: space[0.5] },
});
