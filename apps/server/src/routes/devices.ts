import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';

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
