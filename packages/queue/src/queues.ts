// Central registry of BullMQ queue names. Keep these stable \u2014 they double as
// Redis key prefixes.
export const QUEUE_NAMES = {
  test: 'kairo:test',
  morningBrief: 'kairo:morning-brief',
  preEvent: 'kairo:pre-event',
  liveNow: 'kairo:live-now',
  ingestSports: 'kairo:ingest-sports',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
