import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type DevicePermissionStatus =
  | 'granted'
  | 'denied'
  | 'not_enabled'
  | 'unavailable'
  | 'checking';

/**
 * Reads the OS notification permission on mount and whenever the app
 * returns to the foreground (the user may have flipped the setting in
 * Settings.app while we were suspended).
 *
 * Never prompts — that lives in `registerPushDevice({ requestPermission: true })`.
 */
export function useDevicePermission(): {
  status: DevicePermissionStatus;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<DevicePermissionStatus>('checking');

  const refresh = useCallback(async () => {
    if (Platform.OS === 'web') {
      setStatus('unavailable');
      return;
    }
    try {
      const res = await Notifications.getPermissionsAsync();
      if (res.status === 'granted') setStatus('granted');
      else if (res.status === 'denied') setStatus('denied');
      else setStatus('not_enabled');
    } catch {
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { status, refresh };
}

/** Human copy for the row's value column. */
export function devicePermissionLabel(status: DevicePermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'Allowed';
    case 'denied':
      return 'Blocked';
    case 'not_enabled':
      return 'Not enabled';
    case 'unavailable':
      return 'Unavailable';
    default:
      return '…';
  }
}
