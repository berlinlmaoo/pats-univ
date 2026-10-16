import { CircleAlert, Info } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { radius, size, space, useColors } from '@/theme';
import { Text } from './text';

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'danger' }) {
  const c = useColors();
  const bg = tone === 'info' ? c.accentSubtle : c.dangerSubtle;
  const fg = tone === 'info' ? c.accentSubtleText : c.dangerText;
  const Icon = tone === 'info' ? Info : CircleAlert;
  return (
    <View style={[styles.box, { backgroundColor: bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={size.iconSm} color={fg} strokeWidth={2} style={styles.icon} />
      <Text variant="bodySm" style={[styles.text, { color: fg }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: space[2.5], paddingHorizontal: space[3], paddingVertical: space[3], borderRadius: radius.control },
  icon: { marginTop: 2 },
  text: { flex: 1 },
});
