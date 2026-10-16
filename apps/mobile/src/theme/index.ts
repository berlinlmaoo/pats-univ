import { colors, motion, radius, size, space, type, type ColorTokens, type TypeToken } from '@pats/shared/tokens';
import { useColorScheme, type TextStyle } from 'react-native';

export { colors, motion, radius, size, space, type };
export type { ColorTokens, TypeToken };

/** Loaded font files, keyed by family + weight (React Native picks fonts by file, not weight). */
export const FONT_FILES = {
  body: { 400: 'Inter_400Regular', 500: 'Inter_500Medium', 600: 'Inter_600SemiBold', 700: 'Inter_700Bold', 800: 'Inter_700Bold' },
  display: {
    400: 'PlusJakartaSans_600SemiBold',
    500: 'PlusJakartaSans_600SemiBold',
    600: 'PlusJakartaSans_600SemiBold',
    700: 'PlusJakartaSans_700Bold',
    800: 'PlusJakartaSans_800ExtraBold',
  },
} as const;

export type Weight = 400 | 500 | 600 | 700 | 800;

export function textStyle(token: TypeToken, weight?: Weight): TextStyle {
  const t = type[token];
  return {
    fontFamily: FONT_FILES[t.family][weight ?? t.weight],
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.tracking * t.size,
  };
}

export function useColors(): ColorTokens {
  return colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
