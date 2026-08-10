import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { enqueueTestJob } from '@kairo/queue';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/health/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness probe',
      },
    },
    async () => ({ ok: true }),
  );

  app.get(
    '/api/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness — database + redis',
      },
    },
    async (_req, reply) => {
      const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

      const t0 = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { ok: true, ms: Date.now() - t0 };
      } catch (err) {
        const message =
          process.env.NODE_ENV === 'production'
            ? 'unavailable'
            : err instanceof Error
              ? err.message
              : 'unknown';
        checks.database = { ok: false, error: message };
      }

      const t1 = Date.now();
      try {
        const { getRedisConnection } = await import('@kairo/queue');
        const redis = getRedisConnection();
        await redis.ping();
        checks.redis = { ok: true, ms: Date.now() - t1 };
      } catch (err) {
        const message =
          process.env.NODE_ENV === 'production'
            ? 'unavailable'
            : err instanceof Error
              ? err.message
              : 'unknown';
        checks.redis = { ok: false, error: message };
      }

      const ok = Object.values(checks).every((c) => c.ok);
      return reply.code(ok ? 200 : 503).send({ ok, checks });
    },
  );
}

export async function registerTestQueueRoutes(app: FastifyInstance): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  app.post('/api/test/enqueue', async (req) => {
    const body = (req.body ?? {}) as { message?: string };
    const message = typeof body.message === 'string' ? body.message : 'ping';
    const result = await enqueueTestJob({ message, enqueuedAt: new Date().toISOString() });
    return { enqueued: true, ...result };
  });
}
