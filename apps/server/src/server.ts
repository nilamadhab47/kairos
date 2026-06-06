import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { loadEnv } from './config/env.js';
import authPlugin from './plugins/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTestQueueRoutes } from './routes/test-queue.js';

export async function buildServer(): Promise<FastifyInstance> {
  const env = loadEnv();

  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? {
            level: 'info',
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
            },
          }
        : { level: 'info' },
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: true, // tighten for prod \u2014 see KAIRO_TECH_SPEC \u00a713
    credentials: true,
  });
  await app.register(authPlugin);

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerTestQueueRoutes(app);

  app.get('/', async () => ({
    service: 'kairo-api',
    version: '0.1.0',
    docs: 'see KAIRO_TECH_SPEC.md \u00a76',
  }));

  return app;
}
