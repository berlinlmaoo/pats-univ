import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { size, space, useColors } from '@/theme';
import { Text } from './text';

/** Icon or text action in a stack header, with a full 44 pt touch target. */
export function HeaderButton({ icon: Icon, label, onPress, disabled }: { icon?: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.button, (pressed || disabled) && { opacity: 0.5 }]}
    >
      {Icon ? (
        <Icon size={size.icon + 2} color={c.text} strokeWidth={1.75} />
      ) : (
        <Text variant="body" weight={600} tone="accentText">
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: size.touch, height: size.touch, paddingHorizontal: space[2], alignItems: 'center', justifyContent: 'center' },
});
