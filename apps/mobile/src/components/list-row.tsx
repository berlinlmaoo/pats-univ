import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { size, space, useColors } from '@/theme';
import { Text } from './text';

/** A row inside a Card: optional icon well, title + subtitle, trailing accessory, chevron when tappable. */
export function ListRow({
  icon: Icon,
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  first,
  disabled,
  accessibilityLabel,
}: {
  icon?: LucideIcon;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /** No divider above the first row. */
  first?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth * 2 },
        pressed && { backgroundColor: c.surfaceHover },
      ]}
    >
      {Icon ? (
        <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
          <Icon size={size.icon} color={c.textMuted} strokeWidth={1.75} />
        </View>
      ) : (
        leading
      )}
      <View style={styles.text}>
        <Text variant="body" weight={600} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" tone="textMuted" numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress && !disabled ? <ChevronRight size={size.iconSm} color={c.textMuted} strokeWidth={2} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], minHeight: size.touch + space[4] },
  icon: { width: size.avatar, height: size.avatar, borderRadius: size.avatar / 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: space[0.5] },
});
