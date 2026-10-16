import { StyleSheet, View } from 'react-native';
import { radius, size, space, useColors } from '@/theme';
import { Text } from './text';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ label, tone = 'neutral', dot }: { label: string; tone?: BadgeTone; dot?: boolean }) {
  const c = useColors();
  const map = {
    neutral: { bg: c.surfaceMuted, fg: c.textMuted, dot: c.textMuted },
    accent: { bg: c.accentSubtle, fg: c.accentSubtleText, dot: c.accent },
    success: { bg: c.successSubtle, fg: c.successText, dot: c.success },
    warning: { bg: c.warningSubtle, fg: c.warningText, dot: c.warning },
    danger: { bg: c.dangerSubtle, fg: c.dangerText, dot: c.danger },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: map.dot }]} />}
      <Text variant="caption" weight={500} style={{ color: map.fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1.5],
    height: size.badge,
    paddingHorizontal: space[2.5],
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  dot: { width: size.dot, height: size.dot, borderRadius: size.dot / 2 },
});
