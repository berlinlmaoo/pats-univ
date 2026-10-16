import Constants from 'expo-constants';

/**
 * API origin. EXPO_PUBLIC_API_URL wins; in development the Next.js server on the machine
 * running Metro (same host, port 3000) is used, so simulators and phones on the LAN both work.
 */
export const API_URL: string = (() => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra?.apiUrl as string | undefined);
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:3000`;
  if (__DEV__) return 'http://localhost:3000';
  return 'https://patsuniv.znetworks.id';
})();

export const JOIN_URL = `${API_URL}/join`;
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
