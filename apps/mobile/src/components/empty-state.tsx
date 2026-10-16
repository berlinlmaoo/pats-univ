import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { size, space, useColors } from '@/theme';
import { Text } from './text';

/** Why it's empty + what happens next (+ optional action). */
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
        <Icon size={size.icon} color={c.textMuted} strokeWidth={1.75} />
      </View>
      <Text variant="title3" style={styles.center}>
        {title}
      </Text>
      <Text variant="bodySm" tone="textMuted" style={[styles.center, styles.body]}>
        {body}
      </Text>
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: space[6], paddingVertical: space[12], gap: space[1] },
  icon: { width: size.touch, height: size.touch, borderRadius: size.touch / 2, alignItems: 'center', justifyContent: 'center', marginBottom: space[3] },
  center: { textAlign: 'center' },
  body: { maxWidth: 300 },
  action: { marginTop: space[4] },
});
