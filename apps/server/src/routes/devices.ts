import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { composeCopy, enqueueDeliverPush } from '@kairo/queue';

export async function registerDeviceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/devices',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        summary: 'List registered push devices',
      },
    },
    async (req) => {
      const devices = await prisma.userDevice.findMany({
        where: { userId: req.sessionUser!.id, isActive: true },
        orderBy: { lastSeenAt: 'desc' },
      });
      return { devices };
    },
  );

  app.post(
    '/api/devices',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        summary: 'Register / refresh Expo push token',
        body: {
          type: 'object',
          required: ['expoPushToken', 'platform'],
          properties: {
            expoPushToken: { type: 'string' },
            platform: { type: 'string', enum: ['ios', 'android', 'web'] },
            deviceName: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const body = req.body as {
        expoPushToken: string;
        platform: string;
        deviceName?: string;
      };
      const userId = req.sessionUser!.id;

      // A user is "new to push" if they have no devices yet — send a welcome
      // push once they finish registering the first one. This proves E2E push
      // delivery works on their real device.
      const existingCount = await prisma.userDevice.count({
        where: { userId, isActive: true },
      });

      const device = await prisma.userDevice.upsert({
        where: {
          userId_expoPushToken: {
            userId,
            expoPushToken: body.expoPushToken,
          },
        },
        create: {
          userId,
          expoPushToken: body.expoPushToken,
          platform: body.platform,
          deviceName: body.deviceName,
          isActive: true,
          lastSeenAt: new Date(),
        },
        update: {
          platform: body.platform,
          deviceName: body.deviceName,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });

      // Send exactly one welcome push per user (first time they register a
      // push-capable device). Best-effort — never fails the registration.
      if (existingCount === 0) {
        try {
          const alreadyWelcomed = await prisma.notification.findFirst({
            where: { userId, type: 'welcome' },
            select: { id: true },
          });
          if (!alreadyWelcomed) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { name: true },
            });
            const firstName = user?.name?.split(' ')[0]?.trim() ?? null;
            const copy = await composeCopy({
              kind: 'welcome',
              seed: `welcome:${userId}`,
              firstName,
              userId,
            });
            const notification = await prisma.notification.create({
              data: {
                userId,
                type: 'welcome',
                channel: 'push',
                title: copy.title,
                body: copy.body,
                aiGenerated: copy.aiGenerated,
                status: 'pending',
                scheduledFor: new Date(Date.now() + 3_000),
              },
            });
            await enqueueDeliverPush(
              { notificationId: notification.id },
              { delay: 3_000, jobId: `push_${notification.id}` },
            );
          }
        } catch (err) {
          req.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            '[devices] welcome push enqueue failed',
          );
        }
      }

      return { device };
    },
  );

  app.delete(
    '/api/devices/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        summary: 'Deactivate a device',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const device = await prisma.userDevice.findFirst({
        where: { id, userId: req.sessionUser!.id },
      });
      if (!device) return reply.code(404).send({ error: 'not_found' });
      await prisma.userDevice.update({
        where: { id },
        data: { isActive: false },
      });
      return { ok: true };
    },
  );
}
