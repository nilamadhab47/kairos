import { Queue, type JobsOptions } from 'bullmq';
import { getRedisConnection } from './connection.js';
import { QUEUE_NAMES, type QueueName } from './queues.js';

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
