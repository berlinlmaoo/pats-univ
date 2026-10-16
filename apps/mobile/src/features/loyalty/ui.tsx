import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { radius, size, space, useColors } from '@/theme';
export function Choices({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const c = useColors();
  return (
    <View style={styles.group}>
      <Text variant="bodySm" weight={600}>
        {label}
      </Text>
      <View style={styles.group}>
        {options.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === o.id }}
            onPress={() => onChange(o.id)}
            style={[
              styles.choice,
              {
                backgroundColor: value === o.id ? c.primary : c.surface,
                borderColor: value === o.id ? c.primary : c.borderStrong,
              },
            ]}
          >
            <Text
              weight={600}
              style={{ color: value === o.id ? c.primaryText : c.text }}
            >
              {o.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}
const styles = StyleSheet.create({
  group: { gap: space[3] },
  choice: {
    minHeight: size.controlLg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
