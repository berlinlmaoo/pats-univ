import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { radius, size, space, textStyle, useColors } from '@/theme';
import { Text } from './text';

export function Input({
  invalid,
  style,
  onFocus,
  onBlur,
  ref,
  ...props
}: TextInputProps & { invalid?: boolean; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.placeholder}
      selectionColor={c.accent}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        textStyle('bodyLg'),
        styles.input,
        {
          color: c.text,
          backgroundColor: c.surface,
          borderColor: invalid ? c.danger : focused ? c.accent : c.borderStrong,
        },
        style,
      ]}
      {...props}
    />
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="bodySm" weight={500}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant="caption" tone="dangerText" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: size.controlLg,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: 0,
  },
  field: { gap: space[1.5] },
});
