export * from './connection.js';
export * from './queues.js';
export * from './producer.js';
export { ingestOpenF1Sessions } from './jobs/ingest-f1.js';
export type { IngestF1Result } from './jobs/ingest-f1.js';
export {
  ingestFootballFixtures,
  isFootballConfigured,
  searchFootballTeams,
  CURATED_FOOTBALL_LEAGUES,
} from './jobs/ingest-football.js';
export type { IngestFootballResult, IngestFootballLeagueResult } from './jobs/ingest-football.js';
export { ingestCricketMatches, discoverIndiaSeries } from './jobs/ingest-cricket.js';
export type { IngestCricketResult, IngestCricketSeriesResult } from './jobs/ingest-cricket.js';
export { ingestTennisMatches } from './jobs/ingest-tennis.js';
export type { IngestTennisResult } from './jobs/ingest-tennis.js';
export { processDeliverPushJob } from './jobs/deliver-push.js';
export { processCheckPushReceiptsJob } from './jobs/check-push-receipts.js';
export { processSchedulePreEventJob } from './jobs/schedule-pre-event.js';
export { processScheduleDiscoveryJob } from './jobs/schedule-discovery.js';
export { composeCopy, type CopyContext, type CopyKind } from './lib/copy.js';
export {
  generateStoryline,
  type StoryContext,
  type StoryStage,
  type StoryEvent,
  type StoryUser,
  type Storyline,
  type StoryChapter,
} from './lib/storyteller.js';
export { scoreEventForUser, stagesForScore } from './lib/event-importance.js';
export {
  horizonFor,
  horizonScore,
  computeNovelty,
  scoreForDiscovery,
  pickTopForDiscovery,
  type DiscoveryHorizon,
  type DiscoveryCandidate,
} from './lib/discovery-scoring.js';
export {
  generateDiscoveryPush,
  type DiscoveryContext,
  type DiscoveryEvent,
  type DiscoveryUser,
  type DiscoveryPick,
  type StoryAngle,
} from './lib/discovery-storyteller.js';
export { enrichLogosFromTheSportsDb } from './jobs/enrich-logos.js';
export type { EnrichLogosJobData, EnrichLogosResult } from './jobs/enrich-logos.js';
