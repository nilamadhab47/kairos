import { eventMatchesSubs } from '@kairo/core';
import { prisma } from '@kairo/db';
import { enqueueDeliverPush } from '../producer.js';

export type SchedulePreEventJobData = {
  /** Lookahead window in minutes for creating pending notifications */
  windowMins?: number;
};

function templateCopy(eventTitle: string, mins: number): { title: string; body: string } {
  return {
    title: `Starting in ${mins}m`,
    body: eventTitle,
  };
}

function zonedMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (h % 24) * 60 + m;
}

function zonedYmd(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Interpret YYYY-MM-DD + HH:mm:ss as wall clock in `timeZone` → UTC Date. */
function zonedLocalToUtc(timeZone: string, date: string, time: string): Date {
  const guess = new Date(`${date}T${time}Z`);
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const asZoned = new Date(guess.toLocaleString('en-US', { timeZone })).getTime();
  return new Date(guess.getTime() - (asZoned - asUtc));
}

function isInDnd(mins: number, startM: number, endM: number): boolean {
  if (startM === endM) return false;
  if (startM < endM) return mins >= startM && mins < endM;
  return mins >= startM || mins < endM;
}

/** If fire time falls in DND, delay until the next dndEnd in the user's timezone. */
function adjustForDnd(
  scheduledFor: Date,
  dndStart: Date | null | undefined,
  dndEnd: Date | null | undefined,
  timeZone: string,
): Date {
  if (!dndStart || !dndEnd) return scheduledFor;

  const startM = dndStart.getUTCHours() * 60 + dndStart.getUTCMinutes();
  const endM = dndEnd.getUTCHours() * 60 + dndEnd.getUTCMinutes();
  const localM = zonedMinutes(scheduledFor, timeZone);
  if (!isInDnd(localM, startM, endM)) return scheduledFor;

  const endHH = String(Math.floor(endM / 60)).padStart(2, '0');
  const endMM = String(endM % 60).padStart(2, '0');
  const day = zonedYmd(scheduledFor, timeZone);
  let candidate = zonedLocalToUtc(timeZone, day, `${endHH}:${endMM}:00`);
  if (candidate.getTime() <= scheduledFor.getTime()) {
    const next = new Date(scheduledFor.getTime() + 24 * 60 * 60 * 1000);
    candidate = zonedLocalToUtc(timeZone, zonedYmd(next, timeZone), `${endHH}:${endMM}:00`);
  }
  return candidate;
}

function dayBoundsUtc(timeZone: string, ref: Date = new Date()): { start: Date; end: Date } {
  const day = zonedYmd(ref, timeZone);
  const start = zonedLocalToUtc(timeZone, day, '00:00:00');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function pushBudgetUsed(
  userId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      channel: 'push',
      OR: [
        { status: 'sent', sentAt: { gte: dayStart, lt: dayEnd } },
        {
          status: 'pending',
          type: 'pre_event',
          scheduledFor: { gte: dayStart, lt: dayEnd },
        },
      ],
    },
  });
}

/**
 * Find upcoming subscribed events and create pending pre-event notifications,
 * then enqueue push delivery at scheduled_for (or immediately if due).
 */
export async function processSchedulePreEventJob(
  data: SchedulePreEventJobData = {},
): Promise<{ created: number }> {
  const windowMins = data.windowMins ?? 24 * 60;
  const now = new Date();
  const horizon = new Date(now.getTime() + windowMins * 60_000);

  const users = await prisma.user.findMany({
    where: { onboardingDone: true },
    include: {
      subscriptions: { where: { isActive: true } },
      notificationPreference: true,
    },
  });

  let created = 0;

  for (const user of users) {
    if (user.subscriptions.length === 0) continue;

    const prefs = user.notificationPreference;
    const channels = (prefs?.channels ?? { push: true }) as {
      push?: boolean;
      whatsapp?: boolean;
    };
    if (channels.push === false) continue;

    const preMins = prefs?.preEventMins ?? 15;
    const maxDaily = prefs?.maxDailyPush ?? 4;
    const timeZone = user.timezone?.trim() || 'UTC';
    const { start: dayStart, end: dayEnd } = dayBoundsUtc(timeZone, now);

    let used = await pushBudgetUsed(user.id, dayStart, dayEnd);
    if (used >= maxDaily) continue;

    const categories = [...new Set(user.subscriptions.map((s) => s.category))];

    const events = await prisma.event.findMany({
      where: {
        category: { in: categories },
        status: { in: ['upcoming', 'live', 'scheduled'] },
        startsAt: { gte: now, lte: horizon },
      },
      orderBy: { startsAt: 'asc' },
      take: 80,
    });

    for (const event of events) {
      if (used >= maxDaily) break;

      const relevant = eventMatchesSubs(
        { category: event.category, contextTags: event.contextTags ?? [] },
        user.subscriptions,
      );
      if (!relevant) continue;

      let scheduledFor = new Date(event.startsAt.getTime() - preMins * 60_000);
      scheduledFor = adjustForDnd(
        scheduledFor,
        prefs?.dndStart,
        prefs?.dndEnd,
        timeZone,
      );
      if (scheduledFor.getTime() >= event.startsAt.getTime()) continue;
      if (scheduledFor.getTime() < now.getTime() - 5 * 60_000) continue;

      const existing = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          eventId: event.id,
          type: 'pre_event',
          channel: 'push',
        },
      });
      if (existing) continue;

      const copy = templateCopy(event.title, preMins);
      const notification = await prisma.notification.create({
        data: {
          userId: user.id,
          eventId: event.id,
          type: 'pre_event',
          channel: 'push',
          title: copy.title,
          body: copy.body,
          aiGenerated: false,
          status: 'pending',
          scheduledFor,
        },
      });

      const delay = Math.max(0, scheduledFor.getTime() - Date.now());
      await enqueueDeliverPush(
        { notificationId: notification.id },
        { delay, jobId: `push:${notification.id}` },
      );
      created += 1;
      used += 1;
    }
  }

  return { created };
}
