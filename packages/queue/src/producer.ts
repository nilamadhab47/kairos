import { Queue, type JobsOptions, type Job } from 'bullmq';
import { getRedisConnection } from './connection.js';
import { QUEUE_NAMES, type QueueName } from './queues.js';
import type { EnrichLogosJobData, EnrichLogosResult } from './jobs/enrich-logos.js';

const queueCache = new Map<QueueName, Queue>();

export function getQueue<T = unknown>(name: QueueName): Queue<T> {
  let queue = queueCache.get(name) as Queue<T> | undefined;
  if (!queue) {
    queue = new Queue<T>(name, { connection: getRedisConnection() });
    queueCache.set(name, queue as Queue);
  }
  return queue;
}

export interface TestJobData {
  message: string;
  enqueuedAt: string;
}

export async function enqueueTestJob(
  data: TestJobData,
  opts?: JobsOptions,
): Promise<{ id: string; queue: string }> {
  const queue = getQueue<TestJobData>(QUEUE_NAMES.test);
  const job = await queue.add('test', data, {
    removeOnComplete: 100,
    removeOnFail: 50,
    ...opts,
  });
  return { id: job.id ?? 'unknown', queue: queue.name };
}

/**
 * Ingest job — one queue per sport for isolation, retries, and priority.
 * `sport` is required. Each sport has its own scheduler cadence.
 */
export type IngestSportJobData = {
  sport: 'f1' | 'football' | 'cricket' | 'tennis';
  /** For football: season override (start year). */
  season?: number;
  /** For football: subset of curated leagues. */
  leagueIds?: number[];
  /** For cricket: segment. */
  cricketSegment?: 'upcoming' | 'live' | 'all';
  /** For tennis: days ahead to scan (max 14). */
  tennisDaysAhead?: number;
  /** For F1: explicit year. */
  year?: number;
};

export async function enqueueIngestSport(
  data: IngestSportJobData,
  opts?: JobsOptions,
): Promise<{ id: string; queue: string }> {
  const queue = getQueue<IngestSportJobData>(QUEUE_NAMES.ingestSports);
  const job = await queue.add(`ingest:${data.sport}`, data, {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
    ...opts,
  });
  return { id: job.id ?? 'unknown', queue: queue.name };
}

export type DeliverPushJobData = {
  notificationId: string;
};

export async function enqueueDeliverPush(
  data: DeliverPushJobData,
  opts?: JobsOptions,
): Promise<{ id: string; queue: string }> {
  const queue = getQueue<DeliverPushJobData>(QUEUE_NAMES.liveNow);
  const job = await queue.add('deliver-push', data, {
    removeOnComplete: 200,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    ...opts,
  });
  return { id: job.id ?? 'unknown', queue: queue.name };
}

export type SchedulePreEventJobData = {
  windowMins?: number;
};

export async function enqueueSchedulePreEvent(
  data: SchedulePreEventJobData = {},
  opts?: JobsOptions,
): Promise<{ id: string; queue: string }> {
  const queue = getQueue<SchedulePreEventJobData>(QUEUE_NAMES.preEvent);
  const job = await queue.add('schedule-pre-event', data, {
    removeOnComplete: 50,
    removeOnFail: 50,
    ...opts,
  });
  return { id: job.id ?? 'unknown', queue: queue.name };
}

export async function enqueueEnrichLogos(
  data: EnrichLogosJobData = {},
  opts?: JobsOptions,
): Promise<{ id: string; queue: string }> {
  const queue = getQueue<EnrichLogosJobData>(QUEUE_NAMES.enrichLogos);
  const job = await queue.add('enrich-logos', data, {
    removeOnComplete: 50,
    removeOnFail: 50,
    // Long-running (rate-limited). Give it plenty of headroom before BullMQ
    // considers it "stalled" and re-enqueues a duplicate.
    ...opts,
  });
  return { id: job.id ?? 'unknown', queue: queue.name };
}

export type EnrichLogosJobStatus = {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  progress?: unknown;
  result?: EnrichLogosResult | null;
  failedReason?: string | null;
  createdAt?: number | null;
  processedOn?: number | null;
  finishedOn?: number | null;
};

export async function getEnrichLogosJob(id: string): Promise<EnrichLogosJobStatus | null> {
  const queue = getQueue<EnrichLogosJobData>(QUEUE_NAMES.enrichLogos);
  const job = (await queue.getJob(id)) as Job<EnrichLogosJobData, EnrichLogosResult> | undefined;
  if (!job) return null;
  const state = await job.getState().catch(() => 'unknown');
  return {
    id: job.id ?? id,
    state: state as EnrichLogosJobStatus['state'],
    progress: job.progress ?? null,
    result: (job.returnvalue as EnrichLogosResult | null | undefined) ?? null,
    failedReason: job.failedReason ?? null,
    createdAt: job.timestamp ?? null,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
  };
}

/**
 * Register (or replace) BullMQ repeatable jobs for scheduled ingest + push
 * scheduling. Idempotent — call once at server boot. Uses `jobId` so repeats
 * are deduplicated by name.
 */
export async function registerRepeatableJobs(): Promise<Array<{ queue: string; name: string; every: number }>> {
  const summary: Array<{ queue: string; name: string; every: number }> = [];
  const ingestQueue = getQueue<IngestSportJobData>(QUEUE_NAMES.ingestSports);
  const preEventQueue = getQueue<SchedulePreEventJobData>(QUEUE_NAMES.preEvent);

  // Cadences (ms):
  const CRON = {
    f1: 6 * 60 * 60_000,        // 6h
    football: 6 * 60 * 60_000,  // 6h
    cricket: 30 * 60_000,       // 30m — live-heavy
    tennis: 12 * 60 * 60_000,   // 12h
    preEvent: 30 * 60_000,      // 30m
  };

  const specs: Array<{ q: Queue; name: string; data: unknown; every: number }> = [
    { q: ingestQueue as unknown as Queue, name: 'ingest:f1', data: { sport: 'f1' }, every: CRON.f1 },
    { q: ingestQueue as unknown as Queue, name: 'ingest:football', data: { sport: 'football' }, every: CRON.football },
    { q: ingestQueue as unknown as Queue, name: 'ingest:cricket', data: { sport: 'cricket' }, every: CRON.cricket },
    { q: ingestQueue as unknown as Queue, name: 'ingest:tennis', data: { sport: 'tennis' }, every: CRON.tennis },
    { q: preEventQueue as unknown as Queue, name: 'schedule-pre-event', data: {}, every: CRON.preEvent },
  ];

  for (const s of specs) {
    await s.q.add(s.name, s.data as never, {
      repeat: { every: s.every },
      jobId: `repeat:${s.name}`,
      removeOnComplete: 50,
      removeOnFail: 50,
    });
    summary.push({ queue: s.q.name, name: s.name, every: s.every });
  }

  // Kick a one-off ingest per sport on boot so a fresh environment doesn't
  // wait up to `every` ms for the first repeat tick to fire. jobId includes
  // the boot timestamp so a redeploy re-fires ingest (BullMQ dedupes on jobId
  // — reusing the same id across restarts silently drops the second add).
  const bootId = Date.now();
  for (const s of specs) {
    if (!s.name.startsWith('ingest:')) continue;
    await s.q.add(`${s.name}:boot`, s.data as never, {
      jobId: `boot:${s.name}:${bootId}`,
      removeOnComplete: 10,
      removeOnFail: 10,
      // Small delay so the worker has time to attach after redeploys.
      delay: 5_000,
    });
  }

  return summary;
}

/**
 * Remove all repeatable jobs. Useful for tests / clean shutdown.
 */
export async function unregisterRepeatableJobs(): Promise<void> {
  const queues = [
    getQueue(QUEUE_NAMES.ingestSports),
    getQueue(QUEUE_NAMES.preEvent),
  ];
  for (const q of queues) {
    const repeats = await q.getRepeatableJobs();
    for (const r of repeats) {
      await q.removeRepeatableByKey(r.key);
    }
  }
}
