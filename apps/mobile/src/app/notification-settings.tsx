import type { NotificationCategory, NotificationPrefs, NotificationPrefsResponse } from '@pats/shared';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadError, Loading } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { pushPermission, registerPush, type PushState } from '@/lib/push';
import { useApi } from '@/lib/use-api';
import { space, useColors } from '@/theme';

const CATEGORIES: NotificationCategory[] = ['events', 'activity'];

/** Which pushes this account gets. Account and crew messages always come through. */
export default function NotificationSettingsScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { call } = useAuth();
  const prefs = useApi<NotificationPrefsResponse>('/api/me/notification-prefs');
  const [value, setValue] = useState<NotificationPrefs | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const shown = value ?? prefs.data?.prefs ?? null;

  useEffect(() => {
    void pushPermission().then(setPush);
  }, []);

  const toggle = async (key: NotificationCategory, on: boolean) => {
    const before = shown;
    if (!before) return;
    setValue({ ...before, [key]: on });
    try {
      const res = await call<NotificationPrefsResponse>('PATCH', '/api/me/notification-prefs', { [key]: on });
      setValue(res.prefs);
    } catch {
      setValue(before);
    }
  };

  if (prefs.loading) return <Loading />;
  if (prefs.error || !shown) return <LoadError error={prefs.error!} onRetry={() => void prefs.reload()} />;

  return (
    <Screen edges={['bottom']}>
      {push === 'denied' && (
        <Card style={styles.panel}>
          <Text variant="body" weight={600}>
            {t('app.pushOffTitle')}
          </Text>
          <Text variant="bodySm" tone="textMuted">
            {t('app.pushOffBody')}
          </Text>
          <Button variant="secondary" label={t('app.scanOpenSettings')} onPress={() => void registerPush(call, { ask: true }).then((s) => (s === 'denied' ? Linking.openSettings() : setPush(s)))} />
        </Card>
      )}
      {push === 'unavailable' && <Notice text={t('app.pushUnavailable')} />}
      <Card style={styles.clip}>
        {CATEGORIES.map((key, i) => (
          <View key={key} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
            <View style={styles.flex}>
              <Text variant="body" weight={500}>
                {t(`app.notifCategory.${key}.title`)}
              </Text>
              <Text variant="bodySm" tone="textMuted">
                {t(`app.notifCategory.${key}.body`)}
              </Text>
            </View>
            <Switch value={shown[key]} onValueChange={(on) => void toggle(key, on)} accessibilityLabel={t(`app.notifCategory.${key}.title`)} trackColor={{ true: c.primary, false: c.borderStrong }} />
          </View>
        ))}
      </Card>
      <Text variant="caption" tone="textMuted">
        {t('app.notifAlwaysOn')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  panel: { padding: space[4], gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
  flex: { flex: 1, gap: space[0.5] },
});
