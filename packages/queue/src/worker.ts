// Standalone BullMQ worker entry. Run with `pnpm --filter @kairo/queue dev`
// (tsx watch) for local dev or `pnpm --filter @kairo/queue start` in prod.
import { Worker, type Job } from 'bullmq';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { getRedisConnection, closeRedisConnection } from './connection.js';
import { QUEUE_NAMES } from './queues.js';
import { processTestJob } from './jobs/test.js';
import { ingestOpenF1Sessions } from './jobs/ingest-f1.js';
import { ingestFootballFixtures } from './jobs/ingest-football.js';
import { ingestCricketMatches } from './jobs/ingest-cricket.js';
import { ingestTennisMatches } from './jobs/ingest-tennis.js';
import { processDeliverPushJob } from './jobs/deliver-push.js';
import { processSchedulePreEventJob } from './jobs/schedule-pre-event.js';
import { enrichLogosFromTheSportsDb, type EnrichLogosJobData } from './jobs/enrich-logos.js';
import { initSportsProviders } from '@kairo/sports';
import type {
  DeliverPushJobData,
  IngestSportJobData,
  SchedulePreEventJobData,
} from './producer.js';
import { enqueueSchedulePreEvent } from './producer.js';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv({ path: resolve(process.cwd(), '.env') });

// Register sports providers on the router before any ingest job runs.
// Without this, `sportsRouter.fetchMatches({ sport: 'f1' | 'cricket' | 'tennis' })`
// throws "No provider registered for sport: …" because the worker process
// starts with an empty router.
initSportsProviders();

const connection = getRedisConnection();
const workers: Worker[] = [];

workers.push(
  new Worker(QUEUE_NAMES.test, processTestJob, {
    connection,
    concurrency: 4,
  }),
);

function sportFromIngestJob(job: Job<IngestSportJobData>): IngestSportJobData['sport'] | undefined {
  if (job.data?.sport) return job.data.sport;
  // Repeatable jobs sometimes land with empty data; name is `ingest:f1` etc.
  const fromName = /^ingest:(f1|football|cricket|tennis)$/.exec(job.name)?.[1];
  return fromName as IngestSportJobData['sport'] | undefined;
}

workers.push(
  new Worker(
    QUEUE_NAMES.ingestSports,
    async (job: Job<IngestSportJobData>) => {
      const sport = sportFromIngestJob(job);
      let result: unknown;
      switch (sport) {
        case 'f1':
          result = await ingestOpenF1Sessions({ year: job.data?.year });
          break;
        case 'football':
          result = await ingestFootballFixtures({
            season: job.data?.season,
            leagueIds: job.data?.leagueIds,
          });
          break;
        case 'cricket':
          result = await ingestCricketMatches({
            segment: job.data?.cricketSegment ?? 'all',
          });
          break;
        case 'tennis':
          result = await ingestTennisMatches({
            daysAhead: job.data?.tennisDaysAhead ?? 7,
          });
          break;
        default:
          throw new Error(
            `unknown sport: ${sport ?? 'undefined'} (job.name=${job.name})`,
          );
      }
      // After fresh fixtures land, schedule pre-event pushes for subscribed users.
      try {
        await enqueueSchedulePreEvent({}, { jobId: `post-ingest-pre-event:${job.id ?? Date.now()}` });
      } catch {
        // Non-fatal — repeatable pre-event job remains the safety net.
      }
      return result;
    },
    { connection, concurrency: 1 },
  ),
);

workers.push(
  new Worker(
    QUEUE_NAMES.liveNow,
    async (job: Job<DeliverPushJobData>) => processDeliverPushJob(job.data),
    { connection, concurrency: 8 },
  ),
);

workers.push(
  new Worker(
    QUEUE_NAMES.preEvent,
    async (job: Job<SchedulePreEventJobData>) =>
      processSchedulePreEventJob(job.data),
    { connection, concurrency: 1 },
  ),
);

// Logo enrichment — rate-limited (30 req/min against TheSportsDB free tier),
// so concurrency=1 and a generous lock so it isn't marked stalled mid-run.
workers.push(
  new Worker(
    QUEUE_NAMES.enrichLogos,
    async (job: Job<EnrichLogosJobData>) => enrichLogosFromTheSportsDb(job.data),
    {
      connection,
      concurrency: 1,
      lockDuration: 10 * 60_000,
      stalledInterval: 60_000,
    },
  ),
);

for (const w of workers) {
  w.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log(`[worker] ready: ${w.name}`);
  });
  w.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${w.name}] job ${job?.id ?? '?'} failed:`, err.message);
  });
  w.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[worker:${w.name}] job ${job.id ?? '?'} completed`);
  });
}

// eslint-disable-next-line no-console
console.log('[worker] kairo worker started — waiting for jobs');

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] received ${signal}, shutting down`);
  await Promise.all(workers.map((w) => w.close()));
  await closeRedisConnection();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
