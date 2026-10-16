import { StyleSheet, View } from 'react-native';
import { FONT_FILES, radius, size, space, useColors } from '@/theme';
import { Text } from './text';

/** Text wordmark until the brand logo arrives (T13). */
export function Wordmark() {
  const c = useColors();
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { backgroundColor: c.primary, borderRadius: radius.sm }]}>
        <Text variant="label" weight={800} tone="primaryText" style={styles.markText}>
          PU
        </Text>
      </View>
      <Text variant="bodyLg" weight={700} style={{ fontFamily: FONT_FILES.display[700] }}>
        PATS University
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  mark: { width: size.logoMark, height: size.logoMark, alignItems: 'center', justifyContent: 'center' },
  markText: { letterSpacing: 0 },
});
