// Standalone BullMQ worker entry. Run with `pnpm --filter @kairo/queue dev`
// (tsx watch) for local dev or `pnpm --filter @kairo/queue start` in prod.
import { Worker } from 'bullmq';
import { getRedisConnection, closeRedisConnection } from './connection.js';
import { QUEUE_NAMES } from './queues.js';
import { processTestJob } from './jobs/test.js';

const connection = getRedisConnection();

const workers: Worker[] = [];

workers.push(
  new Worker(QUEUE_NAMES.test, processTestJob, {
    connection,
    concurrency: 4,
  }),
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
}

// eslint-disable-next-line no-console
console.log('[worker] kairo worker started \u2014 waiting for jobs');

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] received ${signal}, shutting down`);
  await Promise.all(workers.map((w) => w.close()));
  await closeRedisConnection();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
