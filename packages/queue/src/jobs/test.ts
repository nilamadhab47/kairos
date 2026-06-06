import type { Job } from 'bullmq';
import type { TestJobData } from '../producer.js';

export async function processTestJob(job: Job<TestJobData>): Promise<{ ok: true }> {
  // eslint-disable-next-line no-console
  console.log(
    `[worker:test] processing job ${job.id} \u2014 message: "${job.data.message}" (enqueued ${job.data.enqueuedAt})`,
  );
  return { ok: true };
}
