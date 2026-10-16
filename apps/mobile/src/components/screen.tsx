import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { size, space, useColors } from '@/theme';
import { Text } from './text';

/** Page scaffold: safe area, scroll, keyboard avoidance, optional large title. */
export function Screen({
  title,
  subtitle,
  children,
  edges = ['top'],
  refreshing,
  onRefresh,
  center,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  center?: boolean;
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, center && styles.center]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.textMuted} /> : undefined}
        >
          {title && (
            <View style={styles.header}>
              <Text variant="title1" accessibilityRole="header">
                {title}
              </Text>
              {subtitle && (
                <Text variant="body" tone="textMuted">
                  {subtitle}
                </Text>
              )}
            </View>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[10], gap: space[4], width: '100%', maxWidth: size.contentMax / 2, alignSelf: 'center' },
  center: { justifyContent: 'center' },
  header: { gap: space[1], marginBottom: space[2] },
});
