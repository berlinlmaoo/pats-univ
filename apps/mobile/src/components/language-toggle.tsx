import { LOCALES } from '@pats/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n';
import { radius, size, space, useColors } from '@/theme';
import { Text } from './text';

/** ID / EN segmented switch, same as the web's. */
export function LanguageToggle() {
  const { t, locale, setLocale } = useI18n();
  const c = useColors();
  return (
    <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="radiogroup" accessibilityLabel={t('common.language')}>
      {LOCALES.map((l) => {
        const selected = l === locale;
        return (
          <Pressable
            key={l}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={l === 'id' ? t('common.indonesian') : t('common.english')}
            hitSlop={4}
            onPress={() => setLocale(l)}
            style={[styles.item, selected && { backgroundColor: c.surface }]}
          >
            <Text variant="bodySm" weight={600} tone={selected ? 'text' : 'textMuted'}>
              {l.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: radius.control, padding: space[0.5] },
  item: { minWidth: size.touch, height: size.controlSm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control - 2, paddingHorizontal: space[3] },
});
