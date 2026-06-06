import type {
  EVENT_SOURCES,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
} from '../constants.js';

export type EventSource = (typeof EVENT_SOURCES)[number];
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface KairoEvent {
  id: string;
  source: EventSource;
  category: EventCategory;
  title: string;
  subtitle: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: EventStatus;
  metadata: Record<string, unknown>;
  contextTags: string[];
  sourceEventId: string | null;
}
