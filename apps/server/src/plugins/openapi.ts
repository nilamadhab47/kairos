import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import scalarApiReference from '@scalar/fastify-api-reference';
import type { Env } from '../config/env.js';

export async function registerOpenApi(app: FastifyInstance, env: Env): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Kairo API',
        description:
          'Kairo backend — auth (Better Auth under /api/auth), sports events, notifications, habits.\n\n' +
          '**Auth for try-it:** sign in via `/api/auth/*`, then paste the session cookie or Bearer token ' +
          'into Scalar (Authorize → bearerAuth).',
        version: '0.3.0',
      },
      servers: [{ url: env.BETTER_AUTH_URL || env.API_URL }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'Better Auth session token (Authorization: Bearer <token>)',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'better-auth.session_token',
          },
        },
      },
      tags: [
        { name: 'health' },
        { name: 'me' },
        { name: 'subscriptions' },
        { name: 'events' },
        { name: 'catalog' },
        { name: 'devices' },
        { name: 'notifications' },
        { name: 'habits' },
        { name: 'sources' },
        { name: 'admin' },
      ],
    },
  });

  await app.register(scalarApiReference, {
    routePrefix: '/api/docs',
    configuration: {
      url: '/api/openapi.json',
      theme: 'kepler',
    },
  });

  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());
}
