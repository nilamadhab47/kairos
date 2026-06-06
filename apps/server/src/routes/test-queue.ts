import type { FastifyInstance } from 'fastify';
import { enqueueTestJob } from '@kairo/queue';

/**
 * Dev-only smoke routes for verifying the BullMQ pipeline end-to-end.
 * Remove or gate behind auth for production.
 */
export async function registerTestQueueRoutes(app: FastifyInstance): Promise<void> {
  app.post('/test/enqueue', async (req) => {
    const body = (req.body ?? {}) as { message?: string };
    const result = await enqueueTestJob({
      message: body.message ?? 'hello from kairo server',
      enqueuedAt: new Date().toISOString(),
    });
    return { enqueued: true, ...result };
  });
}
