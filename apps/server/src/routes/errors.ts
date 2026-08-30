import type { FastifyInstance } from 'fastify';
import { recordAppError } from '@kairo/db';

export async function registerErrorRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/errors',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['health'],
        security: [{ bearerAuth: [] }],
        summary: 'Record a unique client error (deduped + capped in Postgres)',
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            name: { type: 'string' },
            message: { type: 'string' },
            stack: { type: 'string' },
            path: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as {
        name?: string;
        message?: string;
        stack?: string;
        path?: string;
      };
      await recordAppError({
        source: 'mobile',
        name: body.name,
        message: typeof body.message === 'string' ? body.message : 'unknown',
        stack: body.stack,
        path: body.path,
      });
      return { ok: true };
    },
  );
}
