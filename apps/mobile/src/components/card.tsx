import { StyleSheet, View, type ViewProps } from 'react-native';
import { radius, useColors } from '@/theme';

export function Card({ style, ...props }: ViewProps) {
  const c = useColors();
  return (
    <View
      style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.card }, style]}
      {...props}
    />
  );
}
