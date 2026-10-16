import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { APP_VERSION } from './config';
import { PUSH_TOKEN_KEY } from './push-keys';
import { storage } from './storage';

/**
 * Push (PRODUCT.md §8): the phone's Expo push token is registered with the server after sign-in
 * and removed at sign-out. Real pushes need a physical device and a build with an EAS project id
 * (docs/NFC-DEV-BUILD.md); anywhere else this reports why instead of failing.
 */

export type PushState = 'on' | 'denied' | 'unavailable';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId ?? undefined;

/** Whether this build can receive pushes at all (device, not Expo Go, has a project id). */
export function pushAvailable(): boolean {
  return Platform.OS !== 'web' && Device.isDevice && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && Boolean(projectId());
}

type Call = <T>(method: 'POST' | 'DELETE', path: string, body?: unknown) => Promise<T>;

/** Asks once (if never asked), then registers the token. Safe to call on every app start. */
export async function registerPush(call: Call, opts: { ask: boolean }): Promise<PushState> {
  if (!pushAvailable()) return 'unavailable';
  if (Platform.OS === 'android') {
    // eslint-disable-next-line import/namespace -- re-exported enum the lint resolver can't follow (tsc checks it)
    await Notifications.setNotificationChannelAsync('default', { name: 'PATS University', importance: Notifications.AndroidImportance.HIGH }).catch(() => null);
  }
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && opts.ask && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return 'denied';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await call('POST', '/api/me/devices', { platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', pushToken: token, appVersion: APP_VERSION });
    await storage.set(PUSH_TOKEN_KEY, token);
    return 'on';
  } catch {
    return 'unavailable';
  }
}

export async function pushPermission(): Promise<PushState> {
  if (!pushAvailable()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'on' : 'denied';
}

/** Where a notification leads when tapped (its `data.screen`). */
export function hrefFor(data: Record<string, unknown> | null | undefined): Href | null {
  const screen = data?.screen;
  const eventId = typeof data?.eventId === 'string' ? data.eventId : null;
  if (screen === 'event' && eventId) return { pathname: '/event/[id]', params: { id: eventId } };
  if (screen === 'hub') return typeof data?.conversationId === 'string' && data.conversationId ? { pathname: '/social-channel', params: { conversationId: data.conversationId } } : typeof data?.channelId === 'string' && data.channelId ? { pathname: '/social-channel', params: { id: data.channelId } } : '/social-hub';
  if (screen === 'social-operations' || screen === 'reservations') return '/social-operations';
  if (screen === 'roaming') return '/roaming';
  if (screen === 'history') return '/history';
  if (screen === 'card') return '/card';
  if (screen === 'memberCard' && typeof data?.memberId === 'string') return { pathname: '/member-cards/[id]', params: { id: data.memberId } };
  return null;
}

/** Opens the right screen when a push is tapped (also when it launched the app). */
export function listenForTaps(): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    const href = hrefFor(response?.notification.request.content.data as Record<string, unknown>);
    if (href) setTimeout(() => router.push(href), 0);
  };
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
