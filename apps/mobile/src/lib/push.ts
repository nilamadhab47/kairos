import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';

export type PushRegisterResult =
  | { ok: true; expoPushToken: string }
  | { ok: false; reason: 'denied' | 'unavailable' | 'no_project' | 'error'; message?: string };

function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return (
    extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Request notification permission (if needed), fetch Expo push token, POST /api/devices.
 * Safe to call repeatedly — upserts by (userId, token).
 */
export async function registerPushDevice(opts?: {
  /** When false, do not prompt — only register if already granted. */
  requestPermission?: boolean;
}): Promise<PushRegisterResult> {
  const requestPermission = opts?.requestPermission ?? true;

  try {
    if (Platform.OS === 'web') {
      return { ok: false, reason: 'unavailable', message: 'Push not supported on web' };
    }

    await ensureAndroidChannel();

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && requestPermission) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    const projectId = easProjectId();
    if (!projectId) {
      return { ok: false, reason: 'no_project', message: 'Missing EAS projectId' };
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResult.data;
    if (!expoPushToken) {
      return { ok: false, reason: 'unavailable', message: 'No Expo push token returned' };
    }

    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const deviceName =
      Constants.deviceName && Constants.deviceName !== 'unknown'
        ? Constants.deviceName
        : undefined;

    await api('/api/devices', {
      method: 'POST',
      json: { expoPushToken, platform, deviceName },
    });

    return { ok: true, expoPushToken };
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : 'Push registration failed',
    };
  }
}
