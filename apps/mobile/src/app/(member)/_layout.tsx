import { Stack } from 'expo-router';
import { stackOptions } from '@/features/stack-options';
import { useT } from '@/i18n';
import { useColors } from '@/theme';

/** Member tabs, plus the screens pushed over them. */
export default function MemberLayout() {
  const c = useColors();
  const t = useT();
  return (
    <Stack screenOptions={stackOptions(c)}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ title: '' }} />
      <Stack.Screen name="history" options={{ title: t('app.historyTitle') }} />
    </Stack>
  );
}
