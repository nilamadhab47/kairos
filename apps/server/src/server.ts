import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { corsOriginList, loadEnv } from './config/env.js';
import authPlugin from './plugins/auth.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes, registerTestQueueRoutes } from './routes/health.js';
import { registerMeRoutes } from './routes/me.js';
import { registerSubscriptionRoutes } from './routes/subscriptions.js';
import { registerEventRoutes } from './routes/events.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerHabitRoutes } from './routes/habits.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerMatchRoutes } from './routes/matches.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { initSportsProviders } from '@kairo/sports';
import { registerRepeatableJobs } from '@kairo/queue';

export async function buildServer(): Promise<FastifyInstance> {
  initSportsProviders();
  const env = loadEnv();

  // Register recurring ingest + pre-event jobs unless explicitly disabled.
  // (Actual job execution happens in the worker process.)
  if (env.NODE_ENV !== 'test' && process.env.KAIRO_DISABLE_SCHEDULER !== '1') {
    try {
      const repeats = await registerRepeatableJobs();
      // eslint-disable-next-line no-console
      console.log('[scheduler] registered repeatable jobs:', repeats.map((r) => r.name).join(', '));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[scheduler] could not register repeatable jobs:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

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
    origin: corsOriginList(env),
    credentials: true,
  });

  await registerOpenApi(app, env);
  await app.register(authPlugin);

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerSubscriptionRoutes(app);
  await registerEventRoutes(app);
  await registerDeviceRoutes(app);
  await registerNotificationRoutes(app);
  await registerHabitRoutes(app);
  await registerCatalogRoutes(app);
  await registerMatchRoutes(app);
  await registerAdminRoutes(app);
  await registerFeedbackRoutes(app);
  await registerTestQueueRoutes(app);

  app.get(
    '/api',
    {
      schema: {
        tags: ['health'],
        summary: 'API root',
      },
    },
    async () => ({
      service: 'kairo-api',
      version: '0.3.0',
      auth: 'better-auth',
      docs: '/api/docs',
      openapi: '/api/openapi.json',
    }),
  );

  return app;
}
