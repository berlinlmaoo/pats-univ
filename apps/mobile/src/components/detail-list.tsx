import { StyleSheet, View } from 'react-native';
import { space, useColors } from '@/theme';
import { Card } from './card';
import { Text } from './text';

export function DetailList({ items }: { items: { label: string; value: string }[] }) {
  const c = useColors();
  return (
    <Card>
      {items.map((item, i) => (
        <View
          key={item.label}
          style={[styles.row, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth * 2 }]}
          accessible
          accessibilityLabel={`${item.label}: ${item.value}`}
        >
          <Text variant="bodySm" tone="textMuted">
            {item.label}
          </Text>
          <Text variant="body" style={styles.value} selectable>
            {item.value}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[0.5] },
  value: { flexShrink: 1 },
});
