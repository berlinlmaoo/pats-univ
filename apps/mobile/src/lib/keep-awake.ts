import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/**
 * Keeps the screen on while a QR or the scanner is shown. Best effort: a refused wake lock
 * (browsers without permission, a backgrounded app) must never break the screen.
 * Returns the cleanup for useFocusEffect.
 */
export function keepAwake(tag: string): () => void {
  activateKeepAwakeAsync(tag).catch(() => null);
  return () => {
    Promise.resolve()
      .then(() => deactivateKeepAwake(tag))
      .catch(() => null);
  };
}
