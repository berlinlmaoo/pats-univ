import { OTP_LENGTH } from '@pats/shared';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, size, space, useColors } from '@/theme';
import { Text } from './text';

/** Six boxes over one hidden input: paste and the iOS/Android one-time-code autofill work. */
export function OtpField({
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const c = useColors();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(true);
  const active = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false}>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        value={value}
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(text) => {
          const next = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
          onChange(next);
          if (next.length === OTP_LENGTH) onComplete?.(next);
        }}
        style={styles.hidden}
      />
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const isActive = focused && i === active && !disabled;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: disabled ? c.surfaceMuted : c.surface,
                  borderColor: invalid ? c.danger : isActive ? c.accent : c.borderStrong,
                  borderWidth: isActive ? 2 : 1,
                },
              ]}
            >
              <Text variant="title2" style={styles.digit}>
                {value[i] ?? ''}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  row: { flexDirection: 'row', gap: space[2] },
  box: {
    flex: 1,
    height: size.controlLg + space[2],
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { textAlign: 'center' },
});
