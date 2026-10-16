import { Stack } from 'expo-router';
import { stackOptions } from '@/features/stack-options';
import { useT } from '@/i18n';
import { useColors } from '@/theme';

/** City admin tabs, plus event management and the scanner. */
export default function AdminLayout() {
  const c = useColors();
  const t = useT();
  return (
    <Stack screenOptions={stackOptions(c)}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="city-events/index" options={{ title: t('app.adminEventsTitle') }} />
      <Stack.Screen name="city-events/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="city-events/new" options={{ title: t('app.adminNewEvent'), presentation: 'modal' }} />
      <Stack.Screen name="city-events/[id]/edit" options={{ title: t('events.editTitle'), presentation: 'modal' }} />
      <Stack.Screen name="reward-validation" options={{ title: t('loyalty.validateReward') }} />
      <Stack.Screen name="operations" options={{ title: t('loyalty.operations') }} />
      <Stack.Screen name="scan/index" options={{ title: t('app.scanPickTitle') }} />
      <Stack.Screen name="scan/[eventId]/index" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="scan/[eventId]/manual" options={{ title: t('app.manualTitle'), presentation: 'modal' }} />
    </Stack>
  );
}
