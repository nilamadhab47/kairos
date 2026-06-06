export const EVENT_SOURCES = [
  'football',
  'f1',
  'cricket',
  'tennis',
  'calendar',
  'youtube',
  'habit',
] as const;

export const EVENT_CATEGORIES = [
  'football',
  'f1',
  'cricket',
  'tennis',
  'work',
  'stream',
  'personal',
] as const;

export const EVENT_STATUSES = ['upcoming', 'live', 'completed', 'cancelled'] as const;

export const NOTIFICATION_TYPES = [
  'morning_brief',
  'pre_event',
  'live_now',
  'habit',
] as const;

export const NOTIFICATION_CHANNELS = ['whatsapp', 'push', 'telegram'] as const;

export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'read'] as const;

export const HABIT_FREQUENCIES = ['daily', 'weekdays', 'weekends', 'custom'] as const;

export const SOURCE_TYPES = ['google_calendar', 'youtube', 'whatsapp'] as const;
