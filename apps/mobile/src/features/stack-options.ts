import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { FONT_FILES, type ColorTokens } from '@/theme';

type StackOptions = Extract<NonNullable<ComponentProps<typeof Stack>['screenOptions']>, object>;

/** Pushed screens (event detail, history, scanner…) share one calm header: no shadow, back arrow only. */
export function stackOptions(c: ColorTokens): StackOptions {
  return {
    headerShown: true,
    headerStyle: { backgroundColor: c.bg },
    headerShadowVisible: false,
    headerTintColor: c.text,
    headerTitleStyle: { fontFamily: FONT_FILES.body[600], color: c.text },
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: c.bg },
  };
}
