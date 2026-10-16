import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { createElement } from 'react';
import { Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { useI18n } from '@/i18n';
import { radius, size, space, textStyle, useColors } from '@/theme';
import { Text } from './text';

type Mode = 'date' | 'time';

/** "2026-10-18" / "20:00" <-> a local Date holding the same wall-clock values. */
function toDate(mode: Mode, value: string): Date {
  if (mode === 'date') {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d, 12, 0);
  }
  const [h, min] = value.split(':').map(Number) as [number, number];
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
}

function fromDate(mode: Mode, d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return mode === 'date' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Wall-clock date or time picker. The value is the city's local time as text, so the phone's own
 * time zone never shifts it. iOS: compact native picker; Android: native dialog; web: <input>.
 */
export function DateTimeField({
  mode,
  value,
  onChange,
  label,
  display,
  invalid,
}: {
  mode: Mode;
  value: string;
  onChange: (value: string) => void;
  /** Accessibility label. */
  label: string;
  /** How the value reads on Android's button, e.g. "18 Okt" or "20.00". */
  display: string;
  invalid?: boolean;
}) {
  const c = useColors();
  const scheme = useColorScheme();
  const { locale } = useI18n();
  const border = { borderColor: invalid ? c.danger : c.borderStrong, backgroundColor: c.surface };

  if (Platform.OS === 'web') {
    return createElement('input', {
      type: mode,
      value,
      'aria-label': label,
      'aria-invalid': invalid || undefined,
      onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
      // DOM style: explicit units and properties (no RN shorthands, no unitless line height).
      style: {
        boxSizing: 'border-box',
        width: '100%',
        height: size.controlLg,
        borderRadius: radius.control,
        border: `1px solid ${border.borderColor}`,
        backgroundColor: border.backgroundColor,
        padding: `0 ${space[3]}px`,
        fontFamily: textStyle('bodyLg').fontFamily,
        fontSize: textStyle('bodyLg').fontSize,
        color: c.text,
        colorScheme: scheme ?? 'light',
      },
    });
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.box, styles.iosBox, border]}>
        <DateTimePicker
          value={toDate(mode, value)}
          mode={mode}
          display="compact"
          // 24-hour comes from the locale on iOS (both id-ID and en-GB use it).
          locale={locale === 'id' ? 'id-ID' : 'en-GB'}
          accentColor={c.accent}
          themeVariant={scheme === 'dark' ? 'dark' : 'light'}
          accessibilityLabel={label}
          onChange={(_e: DateTimePickerEvent, d?: Date) => d && onChange(fromDate(mode, d))}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${display}`}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: toDate(mode, value),
          mode,
          is24Hour: true,
          onChange: (e, d) => e.type === 'set' && d && onChange(fromDate(mode, d)),
        })
      }
      style={[styles.box, border]}
    >
      <Text variant="bodyLg">{display}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { height: size.controlLg, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: space[3], justifyContent: 'center' },
  iosBox: { alignItems: 'flex-start', paddingHorizontal: space[1.5] },
});
