import { Platform } from 'react-native';
import Constants from 'expo-constants';

const RAILWAY_API = 'https://api-production-618f.up.railway.app';

/**
 * Resolve the API base URL.
 *
 * HTTPS (Railway) always wins. That keeps Expo dev-client / Metro from
 * rewriting a working production API to `http://<lan>:4000` — the usual
 * cause of "Network request failed" when the local server is not running.
 *
 * Local LAN rewrite only happens when EXPO_PUBLIC_USE_LOCAL_API=1.
 */
function resolveApiUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  const baked = (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    ''
  ).replace(/\/$/, '');

  const useLocal = process.env.EXPO_PUBLIC_USE_LOCAL_API === '1';

  if (useLocal && typeof __DEV__ !== 'undefined' && __DEV__) {
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
      if (baked.includes('10.0.2.2')) return baked;
      return 'http://10.0.2.2:4000';
    }

    if (Platform.OS === 'ios') {
      return 'http://127.0.0.1:4000';
    }
  }

  if (baked.startsWith('https://')) return baked;
  if (baked) return baked;
  return RAILWAY_API;
}

export const API_URL = resolveApiUrl();

export const isIos = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
