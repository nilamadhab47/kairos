import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin haptics wrapper. No-ops on web + silently swallows errors so calls stay
 * ergonomic in event handlers.
 */
export const haptics = {
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  select: () => run(() => Haptics.selectionAsync()),
  success: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

function run(fn: () => Promise<unknown>) {
  if (Platform.OS === 'web') return;
  fn().catch(() => undefined);
}
