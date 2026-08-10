import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, type SessionUser } from '../lib/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    sessionUser: SessionUser | null;
  }
}

export default fp(async (app) => {
  app.decorateRequest('sessionUser', null);

  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      req.sessionUser = session.user as SessionUser;
    },
  );
});
