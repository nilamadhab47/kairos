import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Resolve the API base URL.
 *
 * In a dev client, prefer the same LAN host Metro is using (hostUri like
 * `192.168.1.5:8081`). That keeps phone ↔ API working even when the APK was
 * baked with a stale EXPO_PUBLIC_API_URL, and matches how Expo serves JS.
 *
 * Emulators:
 * - Android emulator → 10.0.2.2 (host loopback)
 * - iOS simulator → localhost
 */
function resolveApiUrl(): string {
  const baked = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      Constants.manifest2?.extra?.expoGo?.debuggerHost ??
      (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

    if (typeof hostUri === 'string' && hostUri.length > 0) {
      const host = hostUri.split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:4000`;
      }
    }

    if (Platform.OS === 'android') {
      // Physical device without hostUri yet — fall through to baked URL.
      // Emulator: 10.0.2.2 is the host machine.
      if (baked.includes('10.0.2.2')) return baked;
    }

    if (Platform.OS === 'ios' && (!baked || baked.includes('localhost'))) {
      return 'http://127.0.0.1:4000';
    }
  }

  return baked || 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

export const isIos = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
