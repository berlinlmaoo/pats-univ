import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { FONT_FILES, size, space, type ColorTokens } from '@/theme';

/** One tab bar style for members and admins. */
type TabOptions = Extract<NonNullable<ComponentProps<typeof Tabs>['screenOptions']>, object>;

export function tabOptions(c: ColorTokens, bottomInset: number): TabOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: c.text,
    tabBarInactiveTintColor: c.textMuted,
    tabBarStyle: {
      backgroundColor: c.surface,
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      // Native tab bars size themselves (49 + home indicator). The web preview needs room for icon + label.
      ...(Platform.OS === 'web' && {
        height: size.tabBar + bottomInset,
        paddingTop: space[1.5],
        paddingBottom: Math.max(bottomInset, space[1.5]),
      }),
    },
    // Size stays the navigator's default so labels fit the platform tab bar height.
    tabBarLabelStyle: { fontFamily: FONT_FILES.body[500] },
    sceneStyle: { backgroundColor: c.bg },
  };
}
