// Central registry of BullMQ queue names. Keep these stable — they double as
// Redis key prefixes. (BullMQ disallows ':' in queue names.)
export const QUEUE_NAMES = {
  test: 'kairo-test',
  morningBrief: 'kairo-morning-brief',
  preEvent: 'kairo-pre-event',
  discovery: 'kairo-discovery',
  liveNow: 'kairo-deliver-push',
  pushReceipts: 'kairo-push-receipts',
  ingestSports: 'kairo-ingest-sports',
  enrichLogos: 'kairo-enrich-logos',
  enrichMatchEvents: 'kairo-enrich-match-events',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
