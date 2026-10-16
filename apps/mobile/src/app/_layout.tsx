import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth';
import { stackOptions } from '@/features/stack-options';
import { I18nProvider, useI18n, useT } from '@/i18n';
import { listenForTaps, registerPush } from '@/lib/push';
import { useColors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <Navigator ready={fontsLoaded || Boolean(fontError)} />
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

/** Routes by session and role: login, member tabs, or the crew / HQ menu. */
function Navigator({ ready }: { ready: boolean }) {
  const { status, me, call } = useAuth();
  const c = useColors();
  const t = useT();
  const { locale } = useI18n();
  const scheme = useColorScheme();
  const loading = status === 'loading' || !ready;
  const isAdmin = me?.user.capabilities.includes('city.operations') ?? false;
  const userId = me?.user.id;

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  // Pushes are written in the account's language: keep it in step with the app's.
  const serverLocale = me?.user.locale;
  useEffect(() => {
    if (status === 'signedIn' && serverLocale && serverLocale !== locale) void call('PATCH', '/api/me', { locale }).catch(() => null);
  }, [status, serverLocale, locale, call]);

  // Push: register this phone once signed in (asking the first time), open tapped notifications.
  useEffect(() => {
    if (status !== 'signedIn' || !userId) return;
    void registerPush(call, { ask: true });
    return listenForTaps();
  }, [status, userId, call]);

  if (loading) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedIn' && !isAdmin}>
          <Stack.Screen name="(member)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedIn' && isAdmin}>
          <Stack.Screen name="(admin)" />
        </Stack.Protected>
        {/* Open to everyone: a tapped card URL (universal link), and the notification centre. */}
        <Stack.Screen name="c/[token]" options={{ ...stackOptions(c), title: '' }} />
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="social-hub" options={{ ...stackOptions(c), title: t('social.title') }} />
          <Stack.Screen name="social-channel" options={{ ...stackOptions(c), title: t('social.title') }} />
          <Stack.Screen name="social-operations" options={{ ...stackOptions(c), title: t('social.operations') }} />
          <Stack.Screen name="roaming" options={{ ...stackOptions(c), title: t('social.roaming') }} />
          <Stack.Screen name="reservation" options={{ ...stackOptions(c), title: t('social.reserve') }} />
          <Stack.Screen name="notifications" options={{ ...stackOptions(c), title: t('app.notificationsTitle') }} />
          <Stack.Screen name="notification-settings" options={{ ...stackOptions(c), title: t('app.notificationSettingsTitle') }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
