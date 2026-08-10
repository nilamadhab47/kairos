import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { eventMatchesSubs } from '../lib/subscriptions.js';
import { zonedDayBounds, zonedWeekBounds } from '../lib/time.js';

function serializeEvent(
  event: {
    id: string;
    source: string;
    category: string;
    sourceEventId: string | null;
    title: string;
    subtitle: string | null;
    startsAt: Date;
    endsAt: Date | null;
    status: string;
    metadata: unknown;
    contextTags: string[];
  },
  userEvent?: { isDismissed: boolean; isStarred: boolean } | null,
) {
  return {
    id: event.id,
    source: event.source,
    category: event.category,
    sourceEventId: event.sourceEventId,
    title: event.title,
    subtitle: event.subtitle,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    status: event.status,
    metadata: event.metadata,
    contextTags: event.contextTags,
    isDismissed: userEvent?.isDismissed ?? false,
    isStarred: userEvent?.isStarred ?? false,
  };
}

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/events/today',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        summary: "Today's events for the signed-in user (subscription-filtered)",
      },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.sessionUser!.id },
        include: { subscriptions: { where: { isActive: true } } },
      });

      const { start, end } = zonedDayBounds(user.timezone);
      const categories = [...new Set(user.subscriptions.map((s) => s.category))];

      if (categories.length === 0) {
        return { timezone: user.timezone, start: start.toISOString(), end: end.toISOString(), events: [] };
      }

      const events = await prisma.event.findMany({
        where: {
          category: { in: categories },
          startsAt: { gte: start, lt: end },
          status: { not: 'cancelled' },
        },
        orderBy: { startsAt: 'asc' },
      });

      const filtered = events.filter((e) => eventMatchesSubs(e, user.subscriptions));
      const ue = await prisma.userEvent.findMany({
        where: {
          userId: user.id,
          eventId: { in: filtered.map((e) => e.id) },
        },
      });
      const ueMap = new Map(ue.map((u) => [u.eventId, u]));

      return {
        timezone: user.timezone,
        start: start.toISOString(),
        end: end.toISOString(),
        events: filtered
          .filter((e) => !ueMap.get(e.id)?.isDismissed)
          .map((e) => serializeEvent(e, ueMap.get(e.id))),
      };
    },
  );

  app.get(
    '/api/events/week',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        summary: "Week's events (Mon–Sun in user timezone). Use offset=-1 for previous week.",
        querystring: {
          type: 'object',
          properties: {
            offset: {
              type: 'integer',
              description: 'Week offset from current week (0 = this week)',
              default: 0,
            },
          },
        },
      },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.sessionUser!.id },
        include: { subscriptions: { where: { isActive: true } } },
      });

      const offset = Number((req.query as { offset?: number }).offset ?? 0) || 0;
      const clamped = Math.max(-52, Math.min(52, Math.trunc(offset)));
      const ref = new Date(Date.now() + clamped * 7 * 24 * 60 * 60 * 1000);
      const { start, end } = zonedWeekBounds(user.timezone, ref);
      const categories = [...new Set(user.subscriptions.map((s) => s.category))];
      if (categories.length === 0) {
        return {
          timezone: user.timezone,
          offset: clamped,
          start: start.toISOString(),
          end: end.toISOString(),
          events: [],
        };
      }

      const events = await prisma.event.findMany({
        where: {
          category: { in: categories },
          startsAt: { gte: start, lt: end },
          status: { not: 'cancelled' },
        },
        orderBy: { startsAt: 'asc' },
      });

      const filtered = events.filter((e) => eventMatchesSubs(e, user.subscriptions));
      return {
        timezone: user.timezone,
        offset: clamped,
        start: start.toISOString(),
        end: end.toISOString(),
        events: filtered.map((e) => serializeEvent(e)),
      };
    },
  );

  app.get(
    '/api/events/live',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        summary: 'Currently live subscribed events',
      },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.sessionUser!.id },
        include: { subscriptions: { where: { isActive: true } } },
      });
      const categories = [...new Set(user.subscriptions.map((s) => s.category))];
      if (categories.length === 0) return { events: [] };

      const events = await prisma.event.findMany({
        where: { category: { in: categories }, status: 'live' },
        orderBy: { startsAt: 'asc' },
      });
      return {
        events: events
          .filter((e) => eventMatchesSubs(e, user.subscriptions))
          .map((e) => serializeEvent(e)),
      };
    },
  );

  app.get(
    '/api/events/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        summary: 'Event detail',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return reply.code(404).send({ error: 'not_found' });
      const userEvent = await prisma.userEvent.findUnique({
        where: {
          userId_eventId: { userId: req.sessionUser!.id, eventId: id },
        },
      });
      return serializeEvent(event, userEvent);
    },
  );

  app.post(
    '/api/events/:id/dismiss',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        summary: 'Dismiss event from Today',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return reply.code(404).send({ error: 'not_found' });
      await prisma.userEvent.upsert({
        where: {
          userId_eventId: { userId: req.sessionUser!.id, eventId: id },
        },
        create: {
          userId: req.sessionUser!.id,
          eventId: id,
          isDismissed: true,
        },
        update: { isDismissed: true },
      });
      return { ok: true };
    },
  );

  app.post(
    '/api/events/:id/star',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        summary: 'Toggle star on event',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return reply.code(404).send({ error: 'not_found' });
      const existing = await prisma.userEvent.findUnique({
        where: {
          userId_eventId: { userId: req.sessionUser!.id, eventId: id },
        },
      });
      const next = !(existing?.isStarred ?? false);
      await prisma.userEvent.upsert({
        where: {
          userId_eventId: { userId: req.sessionUser!.id, eventId: id },
        },
        create: {
          userId: req.sessionUser!.id,
          eventId: id,
          isStarred: next,
        },
        update: { isStarred: next },
      });
      return { isStarred: next };
    },
  );
}
