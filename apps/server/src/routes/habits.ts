import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { parseTimeToDate, formatTimeFromDate } from '../lib/time.js';

export async function registerHabitRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/habits',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['habits'],
        security: [{ bearerAuth: [] }],
        summary: 'List habits',
      },
    },
    async (req) => {
      const habits = await prisma.habit.findMany({
        where: { userId: req.sessionUser!.id, isActive: true },
        orderBy: { createdAt: 'asc' },
        include: {
          completions: {
            orderBy: { completedDate: 'desc' },
            take: 14,
          },
        },
      });
      return {
        habits: habits.map((h) => ({
          ...h,
          scheduledTime: formatTimeFromDate(h.scheduledTime),
          completions: h.completions.map((c) => ({
            id: c.id,
            completedDate: c.completedDate.toISOString().slice(0, 10),
            completedAt: c.completedAt.toISOString(),
          })),
        })),
      };
    },
  );

  app.post(
    '/api/habits',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['habits'],
        security: [{ bearerAuth: [] }],
        summary: 'Create habit',
        body: {
          type: 'object',
          required: ['title', 'scheduledTime'],
          properties: {
            title: { type: 'string' },
            scheduledTime: { type: 'string', description: 'HH:mm' },
            durationMins: { type: 'integer' },
            frequency: { type: 'string' },
            frequencyDays: { type: 'array', items: { type: 'integer' } },
          },
        },
      },
    },
    async (req) => {
      const body = req.body as {
        title: string;
        scheduledTime: string;
        durationMins?: number;
        frequency?: string;
        frequencyDays?: number[];
      };
      const habit = await prisma.habit.create({
        data: {
          userId: req.sessionUser!.id,
          title: body.title,
          scheduledTime: parseTimeToDate(body.scheduledTime),
          durationMins: body.durationMins ?? 10,
          frequency: body.frequency ?? 'daily',
          frequencyDays: body.frequencyDays ?? [1, 2, 3, 4, 5, 6, 7],
        },
      });
      return {
        habit: { ...habit, scheduledTime: formatTimeFromDate(habit.scheduledTime) },
      };
    },
  );

  app.patch(
    '/api/habits/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['habits'],
        security: [{ bearerAuth: [] }],
        summary: 'Update habit',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = await prisma.habit.findFirst({
        where: { id, userId: req.sessionUser!.id },
      });
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const body = (req.body ?? {}) as {
        title?: string;
        scheduledTime?: string;
        durationMins?: number;
        frequency?: string;
        frequencyDays?: number[];
        isActive?: boolean;
      };

      const habit = await prisma.habit.update({
        where: { id },
        data: {
          ...(body.title ? { title: body.title } : {}),
          ...(body.scheduledTime
            ? { scheduledTime: parseTimeToDate(body.scheduledTime) }
            : {}),
          ...(typeof body.durationMins === 'number'
            ? { durationMins: body.durationMins }
            : {}),
          ...(body.frequency ? { frequency: body.frequency } : {}),
          ...(body.frequencyDays ? { frequencyDays: body.frequencyDays } : {}),
          ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
        },
      });
      return {
        habit: { ...habit, scheduledTime: formatTimeFromDate(habit.scheduledTime) },
      };
    },
  );

  app.post(
    '/api/habits/:id/complete',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['habits'],
        security: [{ bearerAuth: [] }],
        summary: 'Mark habit complete for a date (default today UTC)',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const habit = await prisma.habit.findFirst({
        where: { id, userId: req.sessionUser!.id, isActive: true },
      });
      if (!habit) return reply.code(404).send({ error: 'not_found' });

      const body = (req.body ?? {}) as { date?: string };
      const dateStr = body.date ?? new Date().toISOString().slice(0, 10);
      const completedDate = new Date(`${dateStr}T00:00:00.000Z`);

      await prisma.habitCompletion.upsert({
        where: {
          habitId_completedDate: { habitId: id, completedDate },
        },
        create: { habitId: id, completedDate },
        update: {},
      });

      const updated = await prisma.habit.update({
        where: { id },
        data: {
          currentStreak: habit.currentStreak + 1,
          longestStreak: Math.max(habit.longestStreak, habit.currentStreak + 1),
        },
      });

      return {
        habit: {
          ...updated,
          scheduledTime: formatTimeFromDate(updated.scheduledTime),
        },
      };
    },
  );

  app.delete(
    '/api/habits/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['habits'],
        security: [{ bearerAuth: [] }],
        summary: 'Soft-delete habit',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const habit = await prisma.habit.findFirst({
        where: { id, userId: req.sessionUser!.id },
      });
      if (!habit) return reply.code(404).send({ error: 'not_found' });
      await prisma.habit.update({ where: { id }, data: { isActive: false } });
      return { ok: true };
    },
  );
}
