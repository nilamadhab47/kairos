import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';

const FEEDBACK_CATEGORIES = [
  'suggestion',
  'like',
  'dislike',
  'design',
  'data',
  'other',
] as const;

const ISSUE_CATEGORIES = [
  'wrong_score',
  'wrong_time',
  'missing_event',
  'wrong_team',
  'wrong_logo',
  'wrong_competition',
  'duplicate_event',
  'outdated_data',
  'other',
] as const;

export async function registerFeedbackRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/feedback',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['feedback'],
        security: [{ bearerAuth: [] }],
        summary:
          "Submit feedback or a data-quality issue report. Attach matchId/eventId to help debug the ingestion pipeline.",
        body: {
          type: 'object',
          required: ['kind', 'message'],
          properties: {
            kind: { type: 'string', enum: ['feedback', 'issue'] },
            category: { type: 'string' },
            message: { type: 'string', minLength: 3, maxLength: 4000 },
            matchId: { type: ['string', 'null'] },
            eventId: { type: ['string', 'null'] },
            sportId: { type: ['string', 'null'] },
            metadata: { type: 'object', additionalProperties: true },
            appVersion: { type: ['string', 'null'] },
            platform: { type: ['string', 'null'] },
            timezone: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.sessionUser!.id;
      const body = req.body as {
        kind: 'feedback' | 'issue';
        category?: string;
        message: string;
        matchId?: string | null;
        eventId?: string | null;
        sportId?: string | null;
        metadata?: Record<string, unknown>;
        appVersion?: string | null;
        platform?: string | null;
        timezone?: string | null;
      };

      const allowedCategories =
        body.kind === 'issue' ? ISSUE_CATEGORIES : FEEDBACK_CATEGORIES;
      const category =
        body.category && (allowedCategories as readonly string[]).includes(body.category)
          ? body.category
          : 'other';

      const row = await prisma.feedback.create({
        data: {
          userId,
          kind: body.kind,
          category,
          message: body.message.trim(),
          matchId: body.matchId ?? null,
          eventId: body.eventId ?? null,
          sportId: body.sportId ?? null,
          metadata: (body.metadata ?? {}) as object,
          appVersion: body.appVersion ?? null,
          platform: body.platform ?? null,
          timezone: body.timezone ?? null,
        },
        select: { id: true, kind: true, category: true, createdAt: true, status: true },
      });

      app.log.info(
        {
          event: 'feedback_received',
          feedbackId: row.id,
          kind: row.kind,
          category: row.category,
          userId,
          matchId: body.matchId ?? undefined,
        },
        'feedback received',
      );

      return reply.code(201).send({
        id: row.id,
        kind: row.kind,
        category: row.category,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        // Human-friendly reference for the confirmation screen.
        reference: `K-${row.id.slice(-6).toUpperCase()}`,
      });
    },
  );

  app.get(
    '/api/feedback',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['feedback'],
        security: [{ bearerAuth: [] }],
        summary: "List the current user's submitted feedback / reports.",
      },
    },
    async (req) => {
      const rows = await prisma.feedback.findMany({
        where: { userId: req.sessionUser!.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          kind: true,
          category: true,
          message: true,
          status: true,
          matchId: true,
          eventId: true,
          createdAt: true,
        },
      });
      return {
        feedback: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          reference: `K-${r.id.slice(-6).toUpperCase()}`,
        })),
      };
    },
  );
}
