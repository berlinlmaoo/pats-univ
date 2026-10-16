import { Text as RNText, type TextProps } from 'react-native';
import { textStyle, useColors, type ColorTokens, type TypeToken, type Weight } from '@/theme';

type Tone = 'text' | 'textMuted' | 'accentText' | 'successText' | 'dangerText' | 'warningText' | 'primaryText';

/** Every string on screen goes through this, so type and colour always come from tokens. */
export function Text({
  variant = 'body',
  weight,
  tone = 'text',
  uppercase,
  style,
  ...props
}: TextProps & { variant?: TypeToken; weight?: Weight; tone?: Tone; uppercase?: boolean }) {
  const c: ColorTokens = useColors();
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      style={[textStyle(variant, weight), { color: c[tone] }, uppercase && { textTransform: 'uppercase' }, style]}
      {...props}
    />
  );
}
