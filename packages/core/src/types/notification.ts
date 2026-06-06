import type {
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
} from '../constants.js';

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
