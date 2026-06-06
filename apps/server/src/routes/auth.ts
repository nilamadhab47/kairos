import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@kairo/db';
import { googleSignInSchema, type AuthResponse } from '@kairo/core';
import { googleAudiences, loadEnv } from '../config/env.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();
  const audiences = googleAudiences(env);
  const oauthClient = new OAuth2Client();

  /**
   * POST /auth/google
   * Body: { idToken: string }
   * Verifies a Google ID token issued to one of the configured Kairo clients,
   * upserts the user, and returns a Kairo JWT.
   */
  app.post('/auth/google', async (req, reply) => {
    const parsed = googleSignInSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    if (audiences.length === 0) {
      return reply.code(500).send({
        error: 'google_not_configured',
        message:
          'No Google client IDs configured. Set GOOGLE_CLIENT_ID and/or platform-specific IDs.',
      });
    }

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: parsed.data.idToken,
        audience: audiences,
      });
      payload = ticket.getPayload();
    } catch (err) {
      req.log.warn({ err }, 'google id_token verification failed');
      return reply.code(401).send({ error: 'invalid_id_token' });
    }

    if (!payload?.email) {
      return reply.code(401).send({ error: 'missing_email_claim' });
    }

    const user = await prisma.user.upsert({
      where: { email: payload.email },
      create: {
        email: payload.email,
        name: payload.name ?? null,
        avatarUrl: payload.picture ?? null,
      },
      update: {
        name: payload.name ?? undefined,
        avatarUrl: payload.picture ?? undefined,
      },
    });

    const token = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    const response: AuthResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        onboardingDone: user.onboardingDone,
      },
    };
    return response;
  });

  /**
   * GET /auth/me
   * Returns the authenticated user. Requires Authorization: Bearer <jwt>.
   */
  app.get(
    '/auth/me',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: 'user_not_found' });
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        onboardingDone: user.onboardingDone,
      };
    },
  );
}
