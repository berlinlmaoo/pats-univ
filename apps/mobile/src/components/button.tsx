import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';
import { motion, radius, size, space, useColors } from '@/theme';
import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  compact,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const c = useColors();
  const fill: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: c.primary },
    secondary: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: c.dangerSolid },
  };
  const tone = variant === 'primary' ? 'primaryText' : variant === 'danger' ? 'primaryText' : variant === 'ghost' ? 'textMuted' : 'text';
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        { height: compact ? size.controlMd : size.controlLg, paddingHorizontal: compact ? space[3] : space[5] },
        fill[variant],
        pressed && { transform: [{ scale: motion.pressScale }], opacity: 0.9 },
        inactive && { opacity: 0.5 },
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? c.primaryText : c.textMuted} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            variant={compact ? 'bodySm' : 'body'}
            weight={600}
            tone={tone}
            style={variant === 'danger' ? { color: c.onSolid } : undefined}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', minWidth: size.touch },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
