import { CircleAlert, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { space, useColors } from '@/theme';
import { Button } from './button';
import { EmptyState } from './empty-state';

export function Loading() {
  const c = useColors();
  return (
    <View style={styles.loading} accessibilityLabel={useT()('common.loading')} accessible>
      <ActivityIndicator color={c.textMuted} />
    </View>
  );
}

/** A failed load: what happened and a retry. */
export function LoadError({ error, onRetry }: { error: ApiFailure; onRetry: () => void }) {
  const t = useT();
  const offline = error.code === 'NETWORK';
  return (
    <EmptyState
      icon={offline ? WifiOff : CircleAlert}
      title={offline ? t('app.offlineTitle') : t('errors.generic')}
      body={offline ? t('errors.network') : t.loose(errorKey(error.code))}
      action={<Button variant="secondary" label={t('common.retry')} onPress={onRetry} />}
    />
  );
}

const styles = StyleSheet.create({ loading: { paddingVertical: space[16], alignItems: 'center' } });
