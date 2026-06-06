import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { getRedisConnection } from '@kairo/queue';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

    // DB
    {
      const start = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        checks.db = { ok: true, latencyMs: Date.now() - start };
      } catch (err) {
        checks.db = { ok: false, error: (err as Error).message };
      }
    }

    // Redis
    {
      const start = Date.now();
      try {
        const pong = await getRedisConnection().ping();
        checks.redis = { ok: pong === 'PONG', latencyMs: Date.now() - start };
      } catch (err) {
        checks.redis = { ok: false, error: (err as Error).message };
      }
    }

    const ok = Object.values(checks).every((c) => c.ok);
    return {
      ok,
      service: 'kairo-api',
      timestamp: new Date().toISOString(),
      checks,
    };
  });

  // Lightweight liveness check (no external deps) for Railway/k8s
  app.get('/health/live', async () => ({ ok: true }));
}
