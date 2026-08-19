/**
 * Multi-stage push scheduler.
 *
 * Runs on a repeatable cadence (see registerRepeatableJobs). For every user
 * with an active subscription, scans upcoming events in the next 24h and:
 *
 *   1. Scores (user, event) with `scoreEventForUser` — importance 0..100.
 *   2. Turns that score into a stage set via `stagesForScore`:
 *        ≥ 30 → pre_event   (~15 min before start)
 *        ≥ 55 → also morning_teaser (~8am local, only if event is later today)
 *        ≥ 75 → also midday_hype   (event start − 5h)
 *   3. Runs the `storyteller` ONCE to generate copy for all chosen stages
 *      in a single Anthropic call — three chapters, not three variants.
 *   4. Creates a Notification row per stage, defers the deliver-push job
 *      until each stage's fire time.
 *
 * Idempotent per (user, event, type): if a row for that stage exists, we
 * skip. So this job can (and does) run every 30 min without producing dupes.
 *
 * Budget: existing `maxDailyPush` still applies, filled by stage priority
 * (pre_event first, then morning_teaser, then midday_hype).
 */

import { eventMatchesSubs } from '@kairo/core';
import { prisma } from '@kairo/db';
import { enqueueDeliverPush } from '../producer.js';
import { scoreEventForUser, stagesForScore } from '../lib/event-importance.js';
import {
  generateStoryline,
  type StoryStage,
  type StoryUser,
  type StoryEvent,
} from '../lib/storyteller.js';

export type SchedulePreEventJobData = {
  /** Lookahead window in minutes for creating pending notifications */
  windowMins?: number;
};

/* -------------------------------------------------------------------------- */
/*  Time helpers (timezone-aware — matches the old scheduler exactly).        */
/* -------------------------------------------------------------------------- */

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
        { status: { in: ['sent', 'delivered'] }, sentAt: { gte: dayStart, lt: dayEnd } },
        {
          status: 'pending',
          scheduledFor: { gte: dayStart, lt: dayEnd },
        },
      ],
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Stage fire times                                                          */
/* -------------------------------------------------------------------------- */

function fireTimeFor(
  stage: StoryStage,
  eventStart: Date,
  preMins: number,
  timeZone: string,
  now: Date,
): Date | null {
  if (stage === 'pre_event') {
    return new Date(eventStart.getTime() - preMins * 60_000);
  }
  if (stage === 'midday_hype') {
    // 5h before start, but only if that's still in the future and >30min from now.
    const t = new Date(eventStart.getTime() - 5 * 60 * 60_000);
    if (t.getTime() - now.getTime() < 30 * 60_000) return null;
    return t;
  }
  if (stage === 'morning_teaser') {
    // 8:15 AM local time on the day of the event, but ONLY if the event
    // isn't already firing later today and we're still comfortably early.
    const day = zonedYmd(eventStart, timeZone);
    const candidate = zonedLocalToUtc(timeZone, day, '08:15:00');
    if (candidate.getTime() >= eventStart.getTime() - 60 * 60_000) return null;
    if (candidate.getTime() - now.getTime() < 30 * 60_000) return null;
    return candidate;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Event context helpers                                                     */
/* -------------------------------------------------------------------------- */

const DERBY_TAGS = new Set([
  'derby',
  'rivalry',
  'clasico',
  'el-clasico',
  'north-london',
  'manchester-derby',
  'merseyside',
  'old-firm',
  'india-pakistan',
  'ashes',
]);

const SPORT_LABEL: Record<string, string> = {
  football: 'Football',
  f1: 'Formula 1',
  cricket: 'Cricket',
  tennis: 'Tennis',
};

function extractTeams(event: {
  metadata: unknown;
  title: string;
}): { home: string | null; away: string | null } {
  const m = event.metadata as
    | { homeTeam?: { name?: string } | null; awayTeam?: { name?: string } | null }
    | null
    | undefined;
  const home = m?.homeTeam?.name ?? null;
  const away = m?.awayTeam?.name ?? null;
  if (home && away) return { home, away };
  const parts = event.title.split(/\s+vs\.?\s+/i);
  if (parts.length === 2) return { home: parts[0]!.trim(), away: parts[1]!.trim() };
  return { home: null, away: null };
}

function extractRound(event: { metadata: unknown }): string | null {
  const m = event.metadata as { round?: string | null } | null | undefined;
  return m?.round?.trim() || null;
}

function extractVenue(event: { metadata: unknown }): string | null {
  const m = event.metadata as { venue?: string | null } | null | undefined;
  return m?.venue?.trim() || null;
}

function extractCompetition(event: { subtitle: string | null }): string | null {
  const sub = event.subtitle?.trim();
  if (!sub) return null;
  return sub.split(' · ')[0]?.trim() || sub;
}

function toStoryEvent(event: {
  id: string;
  category: string;
  title: string;
  subtitle: string | null;
  contextTags: string[];
  metadata: unknown;
  startsAt: Date;
}, importanceReasons: string[]): StoryEvent {
  const { home, away } = extractTeams(event);
  return {
    id: event.id,
    sport: event.category,
    sportLabel: SPORT_LABEL[event.category] ?? event.category,
    competition: extractCompetition(event),
    homeTeam: home,
    awayTeam: away,
    round: extractRound(event),
    venue: extractVenue(event),
    startsAt: event.startsAt,
    isDerby:
      (event.contextTags ?? []).some((t) => DERBY_TAGS.has(t) || t.startsWith('derby:')) ||
      importanceReasons.includes('derby'),
    isFinal: importanceReasons.includes('final_or_semi'),
    prestige: importanceReasons.includes('prestige_competition'),
  };
}

/* -------------------------------------------------------------------------- */
/*  Main job                                                                  */
/* -------------------------------------------------------------------------- */

export async function processSchedulePreEventJob(
  data: SchedulePreEventJobData = {},
): Promise<{ created: number; storylines: number }> {
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
  let storylines = 0;

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

    // Build a static view of the user's followed team/comp names for the LLM.
    const followedTeamIds = user.subscriptions
      .filter((s) => s.entityType === 'team')
      .map((s) => s.entityId);
    const followedCompIds = user.subscriptions
      .filter((s) => s.entityType === 'competition')
      .map((s) => s.entityId);
    const followedSports = user.subscriptions
      .filter((s) => s.entityType === 'sport')
      .map((s) => s.category);

    const [teamRows, compRows] = await Promise.all([
      followedTeamIds.length > 0
        ? prisma.team.findMany({
            where: { id: { in: followedTeamIds } },
            select: { name: true },
          })
        : Promise.resolve([]),
      followedCompIds.length > 0
        ? prisma.competition.findMany({
            where: { id: { in: followedCompIds } },
            select: { name: true },
          })
        : Promise.resolve([]),
    ]);

    const storyUser: StoryUser = {
      id: user.id,
      firstName: user.name?.split(' ')[0]?.trim() ?? null,
      followedTeams: teamRows.map((t) => t.name),
      followedCompetitions: compRows.map((c) => c.name),
      followedSports,
    };

    for (const event of events) {
      if (used >= maxDaily) break;

      const relevant = eventMatchesSubs(
        { category: event.category, contextTags: event.contextTags ?? [] },
        user.subscriptions,
      );
      if (!relevant) continue;

      const { score, reasons } = scoreEventForUser(event, user.subscriptions);
      const stagesWanted = stagesForScore(score);
      if (stagesWanted.length === 0) continue;

      // Filter to stages that (a) aren't yet scheduled and (b) still have a
      // valid future fire time within our budget/DND rules.
      const existing = await prisma.notification.findMany({
        where: {
          userId: user.id,
          eventId: event.id,
          channel: 'push',
          type: { in: stagesWanted },
        },
        select: { type: true },
      });
      const alreadyScheduled = new Set(existing.map((n) => n.type as StoryStage));

      type Plan = { stage: StoryStage; fireAt: Date };
      const plans: Plan[] = [];

      // Fill in priority order: pre_event > morning_teaser > midday_hype.
      // The storyteller still gets ALL requested stages so the copy stays
      // coherent, but we only enqueue what fits the budget.
      const priority: StoryStage[] = ['pre_event', 'morning_teaser', 'midday_hype'];
      for (const stage of priority) {
        if (!stagesWanted.includes(stage)) continue;
        if (alreadyScheduled.has(stage)) continue;
        if (used + plans.length >= maxDaily) break;

        let fireAt = fireTimeFor(stage, event.startsAt, preMins, timeZone, now);
        if (!fireAt) continue;
        fireAt = adjustForDnd(fireAt, prefs?.dndStart, prefs?.dndEnd, timeZone);
        if (fireAt.getTime() >= event.startsAt.getTime()) continue;
        if (fireAt.getTime() < now.getTime() - 5 * 60_000) continue;

        plans.push({ stage, fireAt });
      }

      if (plans.length === 0) continue;

      const storyEvent = toStoryEvent(event, reasons);
      const minsUntilByStage: Record<StoryStage, number> = {
        morning_teaser: Math.round((event.startsAt.getTime() - now.getTime()) / 60_000),
        midday_hype: 300,
        pre_event: preMins,
      };
      for (const p of plans) {
        minsUntilByStage[p.stage] = Math.max(
          1,
          Math.round((event.startsAt.getTime() - p.fireAt.getTime()) / 60_000),
        );
      }

      const storyline = await generateStoryline(
        {
          event: storyEvent,
          user: storyUser,
          stages: plans.map((p) => p.stage),
          seed: `${user.id}:${event.id}`,
        },
        minsUntilByStage,
      );

      let anyCreated = false;
      for (const plan of plans) {
        const chapter = storyline[plan.stage];
        if (!chapter) continue;

        const notification = await prisma.notification.create({
          data: {
            userId: user.id,
            eventId: event.id,
            type: plan.stage,
            channel: 'push',
            title: chapter.chosen.title,
            body: chapter.chosen.body,
            aiGenerated: chapter.aiGenerated,
            status: 'pending',
            scheduledFor: plan.fireAt,
            importanceScore: score,
            candidates: {
              stage: plan.stage,
              importanceScore: score,
              importanceReasons: reasons,
              picked: chapter.chosen,
              options: chapter.candidates,
            } as unknown as object,
          },
        });

        const delay = Math.max(0, plan.fireAt.getTime() - Date.now());
        await enqueueDeliverPush(
          { notificationId: notification.id },
          { delay, jobId: `push_${notification.id}` },
        );

        created += 1;
        used += 1;
        anyCreated = true;
      }

      if (anyCreated) storylines += 1;
    }
  }

  return { created, storylines };
}
