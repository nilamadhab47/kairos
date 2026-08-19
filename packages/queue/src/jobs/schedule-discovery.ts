/**
 * Discovery briefing scheduler.
 *
 * Runs every 6h. For each user whose local "briefing window" (07:00–10:00)
 * is open right now AND who hasn't received any discovery pushes for their
 * local day yet, this job:
 *
 *   1. Fetches candidate events in the (24h, 14d] range for the user's
 *      followed categories.
 *   2. Filters to events actually relevant (via eventMatchesSubs).
 *   3. Excludes anything owned by the 24h storyline layer (any existing
 *      pre_event/morning_teaser/midday_hype row for this user+event) and
 *      anything discovery-notified in the last 3 days.
 *   4. Scores each remaining event: importance × 0.55 + horizon × 0.25
 *      + novelty × 0.20.
 *   5. Picks up to 3 with the diversity picker (never the same competition
 *      twice, prefer sport variety).
 *   6. For each pick, calls the discovery storyteller for 8 angle-tagged
 *      candidates in ONE Anthropic call, then chooses the best while
 *      avoiding angle repetition across today's briefing.
 *   7. Creates one Notification row per pick and enqueues deliver-push at
 *      today's slot (09:00 / 13:00 / 18:30 local, DND-adjusted).
 *
 * Idempotent per (user, local day): the "already sent today?" check gates
 * the whole flow, so this job can run more than once a day safely.
 *
 * Budget: discovery has its own daily cap (3), separate from the storyline
 * layer's `maxDailyPush`. Rationale in the design notes.
 */

import { eventMatchesSubs } from '@kairo/core';
import { prisma } from '@kairo/db';
import { enqueueDeliverPush } from '../producer.js';
import {
  horizonFor,
  computeNovelty,
  scoreForDiscovery,
  pickTopForDiscovery,
  type DiscoveryCandidate,
  type DiscoveryHorizon,
} from '../lib/discovery-scoring.js';
import {
  generateDiscoveryPush,
  type DiscoveryEvent,
  type DiscoveryUser,
  type StoryAngle,
} from '../lib/discovery-storyteller.js';

export type ScheduleDiscoveryJobData = Record<string, never>;

const DISCOVERY_DAILY_MAX = 3;
const STORYLINE_TYPES = ['morning_teaser', 'midday_hype', 'pre_event'];

/* -------------------------------------------------------------------------- */
/*  Time helpers — timezone-aware, matches the storyline job semantics.        */
/* -------------------------------------------------------------------------- */

function zonedYmd(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function zonedLocalToUtc(tz: string, ymd: string, hhmmss: string): Date {
  const guess = new Date(`${ymd}T${hhmmss}Z`);
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const asZoned = new Date(guess.toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(guess.getTime() - (asZoned - asUtc));
}

function localHour(at: Date, tz: string): number {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  return Number(s);
}

function localDayBounds(tz: string, ref: Date): { start: Date; end: Date } {
  const day = zonedYmd(ref, tz);
  const start = zonedLocalToUtc(tz, day, '00:00:00');
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

function dndAdjust(
  at: Date,
  dndStart: Date | null | undefined,
  dndEnd: Date | null | undefined,
  tz: string,
): Date {
  if (!dndStart || !dndEnd) return at;
  const startM = dndStart.getUTCHours() * 60 + dndStart.getUTCMinutes();
  const endM = dndEnd.getUTCHours() * 60 + dndEnd.getUTCMinutes();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const local = (h % 24) * 60 + m;

  const inDnd =
    startM === endM
      ? false
      : startM < endM
        ? local >= startM && local < endM
        : local >= startM || local < endM;
  if (!inDnd) return at;

  const endHH = String(Math.floor(endM / 60)).padStart(2, '0');
  const endMM = String(endM % 60).padStart(2, '0');
  const day = zonedYmd(at, tz);
  let candidate = zonedLocalToUtc(tz, day, `${endHH}:${endMM}:00`);
  if (candidate.getTime() <= at.getTime()) {
    const next = new Date(at.getTime() + 24 * 60 * 60_000);
    candidate = zonedLocalToUtc(tz, zonedYmd(next, tz), `${endHH}:${endMM}:00`);
  }
  return candidate;
}

/* -------------------------------------------------------------------------- */
/*  Fire slots — 09:00, 13:00, 18:30 local time, today.                        */
/* -------------------------------------------------------------------------- */

function fireSlotsForToday(now: Date, tz: string): Date[] {
  const day = zonedYmd(now, tz);
  return ['09:00:00', '13:00:00', '18:30:00']
    .map((hhmmss) => zonedLocalToUtc(tz, day, hhmmss))
    // Skip slots already in the past (the job runs multiple times a day).
    .filter((t) => t.getTime() >= now.getTime() - 5 * 60_000);
}

/* -------------------------------------------------------------------------- */
/*  Event context extraction (mirrors schedule-pre-event).                     */
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

function extractCompetition(event: { subtitle: string | null }): string | null {
  const sub = event.subtitle?.trim();
  if (!sub) return null;
  return sub.split(' · ')[0]?.trim() || sub;
}

function competitionIdFromTags(tags: string[] | null | undefined): string | null {
  return (
    tags?.find((t) => t.startsWith('competition:'))?.slice('competition:'.length) ?? null
  );
}

function toDiscoveryEvent(
  event: {
    id: string;
    category: string;
    title: string;
    subtitle: string | null;
    contextTags: string[];
    metadata: unknown;
    startsAt: Date;
  },
  reasons: string[],
): DiscoveryEvent {
  const { home, away } = extractTeams(event);
  const tags = event.contextTags ?? [];
  return {
    id: event.id,
    sport: event.category,
    sportLabel: SPORT_LABEL[event.category] ?? event.category,
    competition: extractCompetition(event),
    homeTeam: home,
    awayTeam: away,
    round: extractRound(event),
    startsAt: event.startsAt,
    isDerby: tags.some((t) => DERBY_TAGS.has(t) || t.startsWith('derby:')) ||
      reasons.includes('derby'),
    isFinal: reasons.includes('final_or_semi'),
    prestige: reasons.includes('prestige_competition'),
  };
}

/* -------------------------------------------------------------------------- */
/*  Main job                                                                   */
/* -------------------------------------------------------------------------- */

export async function processScheduleDiscoveryJob(): Promise<{
  usersProcessed: number;
  usersBriefed: number;
  discoveriesCreated: number;
}> {
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { onboardingDone: true },
    include: {
      subscriptions: { where: { isActive: true } },
      notificationPreference: true,
    },
  });

  let usersProcessed = 0;
  let usersBriefed = 0;
  let discoveriesCreated = 0;

  for (const user of users) {
    usersProcessed += 1;
    if (user.subscriptions.length === 0) continue;

    const prefs = user.notificationPreference;
    const channels = (prefs?.channels ?? { push: true }) as { push?: boolean };
    if (channels.push === false) continue;

    const tz = user.timezone?.trim() || 'UTC';

    // Only brief users whose local time is in the morning window. Combined
    // with per-day idempotency below, this pins the briefing to their morning
    // regardless of when the cron ran.
    const h = localHour(now, tz);
    if (h < 7 || h >= 11) continue;

    // Idempotency: any discovery notif created today (local day)?
    const { start: dayStart, end: dayEnd } = localDayBounds(tz, now);
    const alreadyBriefed = await prisma.notification.count({
      where: {
        userId: user.id,
        channel: 'push',
        type: 'discovery',
        createdAt: { gte: dayStart, lt: dayEnd },
      },
    });
    if (alreadyBriefed > 0) continue;

    // Slot availability for today.
    const slots = fireSlotsForToday(now, tz);
    if (slots.length === 0) continue;
    const maxToday = Math.min(DISCOVERY_DAILY_MAX, slots.length);

    // Candidate events window: 24h..14d.
    const windowStart = new Date(now.getTime() + 24 * 60 * 60_000);
    const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60_000);
    const categories = [...new Set(user.subscriptions.map((s) => s.category))];

    const events = await prisma.event.findMany({
      where: {
        category: { in: categories },
        status: { in: ['upcoming', 'scheduled', 'live'] },
        startsAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });

    if (events.length === 0) continue;

    // Look up prior notifications for every candidate event in one query.
    const eventIds = events.map((e) => e.id);
    const priors = await prisma.notification.findMany({
      where: {
        userId: user.id,
        channel: 'push',
        eventId: { in: eventIds },
      },
      select: {
        eventId: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const priorByEvent = new Map<string, typeof priors>();
    for (const p of priors) {
      if (!p.eventId) continue;
      const list = priorByEvent.get(p.eventId) ?? [];
      list.push(p);
      priorByEvent.set(p.eventId, list);
    }

    const nowMs = now.getTime();
    const candidates: DiscoveryCandidate[] = [];

    for (const event of events) {
      if (!eventMatchesSubs(
        { category: event.category, contextTags: event.contextTags ?? [] },
        user.subscriptions,
      )) continue;

      const horizon = horizonFor(event.startsAt, now, tz);
      if (!horizon) continue;

      const prior = priorByEvent.get(event.id) ?? [];
      const hasStoryline = prior.some((p) => STORYLINE_TYPES.includes(p.type));
      const lastDiscovery = prior.find((p) => p.type === 'discovery');
      const lastAny = prior[0];

      const novelty = computeNovelty({
        hasStoryline,
        lastDiscoveryDaysAgo: lastDiscovery
          ? Math.floor((nowMs - lastDiscovery.createdAt.getTime()) / (24 * 60 * 60_000))
          : null,
        lastAnyDaysAgo: lastAny
          ? Math.floor((nowMs - lastAny.createdAt.getTime()) / (24 * 60 * 60_000))
          : null,
      });
      if (novelty === 0) continue;

      const scored = scoreForDiscovery(event, user.subscriptions, horizon, novelty);
      // Baseline gate — don't waste an Anthropic call on trivia.
      if (scored.total < 45) continue;

      candidates.push({
        event,
        horizon,
        ...scored,
        competitionId: competitionIdFromTags(event.contextTags),
      });
    }

    if (candidates.length === 0) continue;

    const picks = pickTopForDiscovery(candidates, maxToday);
    if (picks.length === 0) continue;

    // Precompute the user's followed team / comp names for the LLM.
    const followedTeamIds = user.subscriptions
      .filter((s) => s.entityType === 'team')
      .map((s) => s.entityId);
    const followedCompIds = user.subscriptions
      .filter((s) => s.entityType === 'competition')
      .map((s) => s.entityId);
    const [teamRows, compRows] = await Promise.all([
      followedTeamIds.length > 0
        ? prisma.team.findMany({ where: { id: { in: followedTeamIds } }, select: { name: true } })
        : Promise.resolve([]),
      followedCompIds.length > 0
        ? prisma.competition.findMany({
            where: { id: { in: followedCompIds } },
            select: { name: true },
          })
        : Promise.resolve([]),
    ]);
    const storyUser: DiscoveryUser = {
      id: user.id,
      firstName: user.name?.split(' ')[0]?.trim() ?? null,
      followedTeams: teamRows.map((t) => t.name),
      followedCompetitions: compRows.map((c) => c.name),
      followedSports: user.subscriptions
        .filter((s) => s.entityType === 'sport')
        .map((s) => s.category),
    };

    let usedNewToday = 0;
    const usedAngles: StoryAngle[] = [];

    for (let i = 0; i < picks.length; i += 1) {
      const pick = picks[i]!;
      const slot = slots[i];
      if (!slot) break;

      // Previous discovery chapters for THIS event (if any) — the LLM uses
      // them so a re-fire reads as chapter 2 rather than a repeat. `priorByEvent`
      // already has the metadata but not the titles, so one small lookup.
      const chapterRows = await prisma.notification.findMany({
        where: {
          userId: user.id,
          eventId: pick.event.id,
          type: 'discovery',
        },
        orderBy: { createdAt: 'asc' },
        select: { title: true },
        take: 5,
      });
      const previousChapters = chapterRows.map((r) => r.title);

      const generation = await generateDiscoveryPush({
        event: toDiscoveryEvent(pick.event, pick.importanceReasons),
        user: storyUser,
        horizon: pick.horizon,
        usedAngles,
        previousChapters,
        seed: `${user.id}:${pick.event.id}:${dayStart.getTime()}`,
      });
      if (!generation) continue;

      const fireAt = dndAdjust(slot, prefs?.dndStart, prefs?.dndEnd, tz);
      // If DND pushed us past the event, or into an already-past slot, skip.
      if (fireAt.getTime() >= pick.event.startsAt.getTime()) continue;
      if (fireAt.getTime() < nowMs - 5 * 60_000) continue;

      const notification = await prisma.notification.create({
        data: {
          userId: user.id,
          eventId: pick.event.id,
          type: 'discovery',
          channel: 'push',
          title: generation.chosen.title,
          body: generation.chosen.body,
          aiGenerated: generation.aiGenerated,
          status: 'pending',
          scheduledFor: fireAt,
          importanceScore: pick.total,
          candidates: {
            layer: 'discovery',
            horizon: pick.horizon,
            angle: generation.chosen.angle,
            picked: generation.chosen,
            score: {
              total: pick.total,
              importance: pick.importance,
              horizon: pick.horizonWeight,
              novelty: pick.novelty,
              reasons: pick.importanceReasons,
            },
            options: generation.candidates,
          } as unknown as object,
        },
      });

      const delay = Math.max(0, fireAt.getTime() - Date.now());
      await enqueueDeliverPush(
        { notificationId: notification.id },
        { delay, jobId: `push_${notification.id}` },
      );

      usedNewToday += 1;
      discoveriesCreated += 1;
      usedAngles.push(generation.chosen.angle);
    }

    if (usedNewToday > 0) usersBriefed += 1;
  }

  console.info('[discovery.briefing.batch]', {
    usersProcessed,
    usersBriefed,
    discoveriesCreated,
  });

  return { usersProcessed, usersBriefed, discoveriesCreated };
}
