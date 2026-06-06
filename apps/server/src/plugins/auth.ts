import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loadEnv } from '../config/env.js';
import type { JwtPayload } from '@kairo/core';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export default fp(async (app) => {
  const env = loadEnv();

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await req.jwtVerify();
      } catch {
        reply.code(401).send({ error: 'unauthorized' });
      }
    },
  );
});
