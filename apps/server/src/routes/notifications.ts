import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { enqueueDeliverPush } from '@kairo/queue';

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/notifications',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['notifications'],
        security: [{ bearerAuth: [] }],
        summary: 'Notification history (newest first)',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 50 },
            unreadOnly: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const q = req.query as { limit?: number; unreadOnly?: boolean };
      const limit = Math.min(Math.max(Number(q.limit ?? 50), 1), 100);
      const notifications = await prisma.notification.findMany({
        where: {
          userId: req.sessionUser!.id,
          ...(q.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          event: {
            select: {
              id: true,
              category: true,
              title: true,
              subtitle: true,
              startsAt: true,
              status: true,
            },
          },
        },
      });
      return {
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          channel: n.channel,
          title: n.title,
          body: n.body,
          status: n.status,
          aiGenerated: n.aiGenerated,
          scheduledFor: n.scheduledFor.toISOString(),
          sentAt: n.sentAt?.toISOString() ?? null,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
          // Delivery tracking (see packages/queue/src/jobs/deliver-push.ts).
          delivery: {
            ticketStatus: n.ticketStatus,
            ticketError: n.ticketError,
            receiptStatus: n.receiptStatus,
            receiptError: n.receiptError,
            receiptCheckedAt: n.receiptCheckedAt?.toISOString() ?? null,
            attemptCount: n.attemptCount,
            errorMsg: n.errorMsg,
          },
          eventId: n.eventId,
          event: n.event
            ? {
                id: n.event.id,
                category: n.event.category,
                title: n.event.title,
                subtitle: n.event.subtitle,
                startsAt: n.event.startsAt.toISOString(),
                status: n.event.status,
              }
            : null,
        })),
      };
    },
  );

  app.patch(
    '/api/notifications/:id/read',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['notifications'],
        security: [{ bearerAuth: [] }],
        summary: 'Mark notification as read',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const n = await prisma.notification.findFirst({
        where: { id, userId: req.sessionUser!.id },
      });
      if (!n) return reply.code(404).send({ error: 'not_found' });
      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date(), status: n.status === 'sent' ? 'read' : n.status },
      });
      return { id: updated.id, readAt: updated.readAt?.toISOString() ?? null };
    },
  );

  app.post(
    '/api/notifications/test',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['notifications'],
        security: [{ bearerAuth: [] }],
        summary: 'Enqueue a test push notification to registered devices',
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.sessionUser!.id;
      const body = (req.body ?? {}) as { title?: string; body?: string };

      const devices = await prisma.userDevice.count({
        where: { userId, isActive: true },
      });
      if (devices === 0) {
        return reply.code(400).send({
          error: 'no_devices',
          message: 'Register an Expo push token via POST /api/devices first',
        });
      }

      const notification = await prisma.notification.create({
        data: {
          userId,
          type: 'pre_event',
          channel: 'push',
          title: body.title ?? 'Kairo test',
          body: body.body ?? 'Push delivery is working.',
          status: 'pending',
          scheduledFor: new Date(),
        },
      });

      const job = await enqueueDeliverPush(
        { notificationId: notification.id },
        { jobId: `push_${notification.id}` },
      );

      return { notificationId: notification.id, job };
    },
  );
}
