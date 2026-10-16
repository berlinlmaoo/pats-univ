import { Stack } from 'expo-router';
import { stackOptions } from '@/features/stack-options';
import { useT } from '@/i18n';
import { useColors } from '@/theme';

/** Crew and HQ tabs, plus events, the scanner and card work. */
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
      <Stack.Screen name="scan/index" options={{ title: t('app.scanPickTitle') }} />
      <Stack.Screen name="scan/[eventId]/index" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="scan/[eventId]/manual" options={{ title: t('app.manualTitle'), presentation: 'modal' }} />
      <Stack.Screen name="handover" options={{ title: t('app.adminHandover') }} />
      <Stack.Screen name="member-cards/index" options={{ title: t('app.adminCards') }} />
      <Stack.Screen name="member-cards/[id]" options={{ title: '' }} />
      <Stack.Screen name="encode/index" options={{ title: t('app.adminEncode') }} />
      <Stack.Screen name="encode/run" options={{ title: t('app.adminEncode') }} />
    </Stack>
  );
}
