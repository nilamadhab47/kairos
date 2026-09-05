/** Sports we actually ship in onboarding. Tennis (and the rest) stay in the
 *  taxonomy/ingest code but are hidden until coverage is honest. */
export const LAUNCH_SPORT_IDS = ['football', 'cricket', 'f1'] as const;
export type LaunchSportId = (typeof LAUNCH_SPORT_IDS)[number];

export function isLaunchSport(id: string): id is LaunchSportId {
  return (LAUNCH_SPORT_IDS as readonly string[]).includes(id);
}

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
