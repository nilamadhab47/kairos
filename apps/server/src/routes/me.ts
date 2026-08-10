import type { FastifyInstance } from 'fastify';
import { Prisma, prisma } from '@kairo/db';
import { personalizedMatchWhere } from '../lib/subscriptions.js';
import {
  parseTimeToDate,
  formatTimeFromDate,
  zonedDayBounds,
  zonedNextDaysBounds,
  zonedWeekBounds,
} from '../lib/time.js';

/**
 * Match rows that are for-sure scheduled (no result yet) should never leak
 * spurious 0-0 scores from provider defaults. Everything else keeps its
 * score. This runs on the serializer so both the API and the UI stay honest.
 */
function safeScore(status: string, home: number | null, away: number | null) {
  const s = (status ?? '').toLowerCase();
  const isPreMatch =
    s === 'scheduled' ||
    s === 'upcoming' ||
    s === 'pending' ||
    s === 'not_started' ||
    s === 'ns';
  if (isPreMatch) return { home: null, away: null };
  return { home, away };
}

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const;

const feedMatchInclude = {
  competition: {
    select: {
      id: true,
      name: true,
      displayName: true,
      country: true,
      logoUrl: true,
      season: true,
      format: true,
    },
  },
  homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, type: true } },
  awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, type: true } },
} as const;

function serializeFeedMatch(m: {
  id: string;
  sportId: string;
  competitionId: string;
  startsAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: string | null;
  metadata: unknown;
  providerRefs: unknown;
  lastSyncedAt: Date;
  competition: {
    id: string;
    name: string;
    displayName: string | null;
    country: string | null;
    logoUrl: string | null;
    season: string | null;
    format: string | null;
  };
  homeTeam: { id: string; name: string; shortName: string | null; logoUrl: string | null; type: string | null } | null;
  awayTeam: { id: string; name: string; shortName: string | null; logoUrl: string | null; type: string | null } | null;
}) {
  const refs = Array.isArray(m.providerRefs) ? m.providerRefs : [];
  const primary = refs[0] as { provider?: string } | undefined;
  return {
    id: m.id,
    sportId: m.sportId,
    competition: {
      ...m.competition,
      // UI always prefers `displayName`. Keep raw `name` for provenance/debug.
      label: m.competition.displayName ?? m.competition.name,
    },
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    startsAt: m.startsAt.toISOString(),
    status: m.status,
    score: safeScore(m.status, m.homeScore, m.awayScore),
    venue: m.venue,
    round: m.round,
    provenance: {
      providerRefs: refs,
      primaryProvider: primary?.provider ?? null,
      lastSyncedAt: m.lastSyncedAt.toISOString(),
    },
  };
}

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/me/today',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary:
          "Personalized Today dashboard: what YOU care about, grouped by sport with a NEXT UP highlight.",
        querystring: {
          type: 'object',
          properties: {
            lookAheadMins: {
              type: 'integer',
              minimum: 30,
              maximum: 24 * 60,
              default: 6 * 60,
              description: 'How far after today to still include an event in NEXT UP',
            },
          },
        },
      },
    },
    async (req) => {
      const userId = req.sessionUser!.id;
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: { subscriptions: { where: { isActive: true } } },
      });

      const { lookAheadMins = 6 * 60 } = req.query as { lookAheadMins?: number };
      const { start: todayStart, end: todayEnd } = zonedDayBounds(user.timezone);
      const now = new Date();

      const subFilter = await personalizedMatchWhere(userId);
      if (!subFilter) {
        return {
          timezone: user.timezone,
          date: todayStart.toISOString(),
          subscriptionCount: 0,
          nextUp: [],
          live: [],
          groups: [],
          upcoming: [],
          empty: {
            kind: 'no_subscriptions',
            message:
              'Kairo is a lot better once you tell it what to watch. Pick a sport or team to get started.',
          },
          source: 'db',
        };
      }

      // Fetch today's window + a small look-ahead for the "NEXT UP" carousel
      // when today itself is thin (typical for weekday mornings).
      const lookAheadEnd = new Date(todayEnd.getTime() + lookAheadMins * 60_000);

      const [todayMatches, liveMatches, upcomingAfterToday] = await Promise.all([
        prisma.match.findMany({
          where: {
            AND: [
              subFilter,
              { startsAt: { gte: todayStart, lt: todayEnd } },
              { status: { not: 'cancelled' } },
            ],
          },
          include: feedMatchInclude,
          orderBy: { startsAt: 'asc' },
          take: 200,
        }),
        prisma.match.findMany({
          where: { AND: [subFilter, { status: 'live' }] },
          include: feedMatchInclude,
          orderBy: { startsAt: 'asc' },
          take: 30,
        }),
        prisma.match.findMany({
          where: {
            AND: [
              subFilter,
              { startsAt: { gte: todayEnd, lt: lookAheadEnd } },
              { status: { not: 'cancelled' } },
            ],
          },
          include: feedMatchInclude,
          orderBy: { startsAt: 'asc' },
          take: 20,
        }),
      ]);

      const todaySerialized = todayMatches.map(serializeFeedMatch);
      const liveSerialized = liveMatches.map(serializeFeedMatch);
      const upcomingSerialized = upcomingAfterToday.map(serializeFeedMatch);

      // NEXT UP: what's happening RIGHT NOW (live) or soonest from `now`.
      // Fall through to tomorrow's early events if today is empty.
      const upcomingFromNow = todaySerialized.filter(
        (m) => new Date(m.startsAt) >= now,
      );
      const nextUpPool = [
        ...liveSerialized,
        ...upcomingFromNow,
        ...upcomingSerialized,
      ];
      // Dedup by id, cap to 3.
      const nextUpSeen = new Set<string>();
      const nextUp = [];
      for (const m of nextUpPool) {
        if (nextUpSeen.has(m.id)) continue;
        nextUpSeen.add(m.id);
        nextUp.push(m);
        if (nextUp.length >= 3) break;
      }

      // Group by sport for the main dashboard body. Preserve sport sort order
      // from the Sport table so football/cricket/f1/tennis feel intentional.
      const sportOrder = await prisma.sport.findMany({
        where: { id: { in: [...new Set(todaySerialized.map((m) => m.sportId))] } },
        select: { id: true, name: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      });
      const groups = sportOrder.map((s) => ({
        sportId: s.id,
        sportLabel: s.name,
        matches: todaySerialized.filter((m) => m.sportId === s.id),
      }));

      const totalToday = todaySerialized.length + liveSerialized.length;

      // FALLBACK: when today is empty, always give the user *something* to
      // anchor on — the next 5 fixtures from their follows over the next
      // ~14 days. Never let the screen be blank if we can help it.
      let upcomingFallback: ReturnType<typeof serializeFeedMatch>[] = [];
      if (totalToday === 0) {
        const fallbackHorizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const rows = await prisma.match.findMany({
          where: {
            AND: [
              subFilter,
              { startsAt: { gte: now, lt: fallbackHorizon } },
              { status: { not: 'cancelled' } },
            ],
          },
          include: feedMatchInclude,
          orderBy: { startsAt: 'asc' },
          take: 5,
        });
        upcomingFallback = rows.map(serializeFeedMatch);
      }

      return {
        timezone: user.timezone,
        date: todayStart.toISOString(),
        subscriptionCount: user.subscriptions.length,
        nextUp,
        live: liveSerialized,
        groups,
        upcoming: upcomingFallback,
        empty:
          totalToday === 0
            ? {
                kind: 'no_events_today',
                message:
                  upcomingFallback.length > 0
                    ? "Nothing on today. Here's what's coming up for what you follow."
                    : "Nothing on today for what you follow. Enjoy the quiet — we'll ping you when things kick off.",
              }
            : null,
        source: 'db',
      };
    },
  );

  app.get(
    '/api/me/feed',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary: 'Personalized feed from subscriptions — today + next N days (Match table)',
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 30, default: 7 },
          },
        },
      },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.sessionUser!.id },
        include: { subscriptions: { where: { isActive: true } } },
      });
      const days = Math.min(30, Math.max(1, Number((req.query as { days?: number }).days ?? 7)));
      const { start: todayStart, end: todayEnd } = zonedDayBounds(user.timezone);
      const { start, end } = zonedNextDaysBounds(user.timezone, days);

      const subFilter = await personalizedMatchWhere(user.id);
      if (!subFilter) {
        return {
          timezone: user.timezone,
          days,
          start: start.toISOString(),
          end: end.toISOString(),
          today: [],
          upcoming: [],
          live: [],
          subscriptionCount: 0,
          source: 'db',
        };
      }

      const matches = await prisma.match.findMany({
        where: {
          AND: [
            subFilter,
            { startsAt: { gte: start, lt: end } },
            { status: { not: 'cancelled' } },
          ],
        },
        include: feedMatchInclude,
        orderBy: { startsAt: 'asc' },
        take: 200,
      });

      const live = await prisma.match.findMany({
        where: {
          AND: [subFilter, { status: 'live' }],
        },
        include: feedMatchInclude,
        orderBy: { startsAt: 'asc' },
        take: 50,
      });

      const today = matches.filter((m) => m.startsAt >= todayStart && m.startsAt < todayEnd);
      const upcoming = matches.filter((m) => m.startsAt >= todayEnd);

      return {
        timezone: user.timezone,
        days,
        start: start.toISOString(),
        end: end.toISOString(),
        today: today.map(serializeFeedMatch),
        upcoming: upcoming.map(serializeFeedMatch),
        live: live.map(serializeFeedMatch),
        subscriptionCount: user.subscriptions.length,
        source: 'db',
      };
    },
  );

  app.get(
    '/api/me/week',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary:
          'Personalized 7-day feed (Mon-Sun) for the week at `offset` weeks from the current week in the user timezone.',
        querystring: {
          type: 'object',
          properties: {
            offset: { type: 'integer', minimum: -52, maximum: 52, default: 0 },
          },
        },
      },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.sessionUser!.id },
        include: { subscriptions: { where: { isActive: true } } },
      });
      const offset = Math.min(
        52,
        Math.max(-52, Number((req.query as { offset?: number }).offset ?? 0)),
      );
      const ref = new Date(Date.now() + offset * 7 * 24 * 60 * 60 * 1000);
      const { start, end } = zonedWeekBounds(user.timezone, ref);
      const subFilter = await personalizedMatchWhere(user.id);

      if (!subFilter) {
        return {
          timezone: user.timezone,
          offset,
          start: start.toISOString(),
          end: end.toISOString(),
          matches: [],
          subscriptionCount: 0,
          empty: {
            kind: 'no_subscriptions' as const,
            message: 'Pick sports and teams to see them on your week.',
          },
          source: 'db',
        };
      }

      const matches = await prisma.match.findMany({
        where: {
          AND: [
            subFilter,
            { startsAt: { gte: start, lt: end } },
            { status: { not: 'cancelled' } },
          ],
        },
        include: feedMatchInclude,
        orderBy: { startsAt: 'asc' },
        take: 500,
      });

      return {
        timezone: user.timezone,
        offset,
        start: start.toISOString(),
        end: end.toISOString(),
        matches: matches.map(serializeFeedMatch),
        subscriptionCount: user.subscriptions.length,
        empty:
          matches.length === 0
            ? {
                kind: 'no_events_this_week' as const,
                message:
                  offset === 0
                    ? "Quiet week for what you follow. We'll ping you when things kick off."
                    : 'Nothing scheduled for this week among your follows.',
              }
            : null,
        source: 'db',
      };
    },
  );

  /**
   * Personalized Calendar — date-windowed and filter-aware.
   *
   * Uses the same relevance engine as Today / Week so the two views can
   * never disagree. Filter params are always intersected with the user's
   * real follows (i.e. `?sport=football` cannot leak football events for
   * a user who doesn't follow football).
   */
  app.get(
    '/api/me/calendar',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary:
          "Personalized calendar with hierarchical filters. Groups events by day in the user's timezone.",
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'ISO date/datetime. Defaults to now.' },
            to: { type: 'string', description: 'ISO date/datetime. Defaults to from+30d.' },
            sport: { type: 'string' },
            competition: { type: 'string' },
            entity: {
              type: 'string',
              description: 'Team/entity id (team id today; driver/player later).',
            },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 300 },
          },
        },
      },
    },
    async (req, reply) => {
      const q = req.query as {
        from?: string;
        to?: string;
        sport?: string;
        competition?: string;
        entity?: string;
        limit?: number;
      };
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.sessionUser!.id },
      });

      const from = q.from ? new Date(q.from) : new Date();
      const to = q.to ? new Date(q.to) : new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
        return reply.code(400).send({ error: 'invalid_date_range' });
      }

      const base = await personalizedMatchWhere(user.id);
      if (!base) {
        return {
          timezone: user.timezone,
          from: from.toISOString(),
          to: to.toISOString(),
          days: [],
          totalMatches: 0,
          empty: {
            kind: 'no_subscriptions' as const,
            message: 'Pick a sport, competition, or team to start building your calendar.',
          },
          source: 'db',
        };
      }

      // Layered filter — every layer must be something the user actually
      // follows. We validate against their subscriptions to prevent the
      // client from asking for arbitrary global data.
      const subs = await prisma.userSubscription.findMany({
        where: { userId: user.id, isActive: true },
        select: { category: true, entityType: true, entityId: true },
      });
      const followedSports = new Set(subs.map((s) => s.category));
      const followedComps = new Set(
        subs.filter((s) => s.entityType === 'competition').map((s) => s.entityId),
      );
      const followedTeams = new Set(
        subs.filter((s) => s.entityType === 'team').map((s) => s.entityId),
      );

      const filterExtra: Prisma.MatchWhereInput = {};
      if (q.sport && followedSports.has(q.sport)) {
        filterExtra.sportId = q.sport;
      }
      if (q.competition && followedComps.has(q.competition)) {
        filterExtra.competitionId = q.competition;
      }
      if (q.entity && followedTeams.has(q.entity)) {
        filterExtra.OR = [{ homeTeamId: q.entity }, { awayTeamId: q.entity }];
      }

      const matches = await prisma.match.findMany({
        where: {
          AND: [
            base,
            filterExtra,
            { startsAt: { gte: from, lt: to } },
            { status: { not: 'cancelled' } },
          ],
        },
        include: feedMatchInclude,
        orderBy: { startsAt: 'asc' },
        take: Math.min(500, q.limit ?? 300),
      });

      // Group by local calendar day (user's timezone).
      type Day = {
        date: string; // YYYY-MM-DD in user tz
        matches: ReturnType<typeof serializeFeedMatch>[];
      };
      const byDay = new Map<string, Day>();
      const dayFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: user.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      for (const m of matches) {
        const key = dayFormatter.format(m.startsAt);
        if (!byDay.has(key)) byDay.set(key, { date: key, matches: [] });
        byDay.get(key)!.matches.push(serializeFeedMatch(m));
      }
      const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

      return {
        timezone: user.timezone,
        from: from.toISOString(),
        to: to.toISOString(),
        days,
        totalMatches: matches.length,
        appliedFilters: {
          sport: filterExtra.sportId ?? null,
          competition: filterExtra.competitionId ?? null,
          entity:
            filterExtra.OR && Array.isArray(filterExtra.OR) && filterExtra.OR[0]
              ? ((filterExtra.OR[0] as { homeTeamId?: string }).homeTeamId ?? null)
              : null,
        },
        empty:
          matches.length === 0
            ? {
                kind: 'no_events_in_window' as const,
                message:
                  q.sport || q.competition || q.entity
                    ? 'Nothing scheduled for this filter in the current window.'
                    : "Quiet stretch — you'll be back to something soon.",
              }
            : null,
        source: 'db',
      };
    },
  );

  /**
   * Flat "what the user follows" list, keyed by sport, hydrated with
   * display metadata (names + logos). Powers the Calendar filter chips
   * without the client having to re-hit /api/subscriptions/summary.
   */
  app.get(
    '/api/me/follows',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary: 'Filter-chip source for the personalized Calendar (sport / comp / team).',
      },
    },
    async (req) => {
      const subs = await prisma.userSubscription.findMany({
        where: { userId: req.sessionUser!.id, isActive: true },
        select: { category: true, entityType: true, entityId: true, entityName: true },
      });

      const sportIds = [...new Set(subs.map((s) => s.category))];
      const compIds = subs.filter((s) => s.entityType === 'competition').map((s) => s.entityId);
      const teamIds = subs.filter((s) => s.entityType === 'team').map((s) => s.entityId);

      const [sportsRows, compsRows, teamsRows] = await Promise.all([
        prisma.sport.findMany({
          where: { id: { in: sportIds } },
          select: { id: true, name: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        }),
        compIds.length
          ? prisma.competition.findMany({
              where: { id: { in: compIds } },
              select: {
                id: true,
                name: true,
                displayName: true,
                sportId: true,
                logoUrl: true,
                country: true,
              },
            })
          : Promise.resolve([]),
        teamIds.length
          ? prisma.team.findMany({
              where: { id: { in: teamIds } },
              select: { id: true, name: true, shortName: true, sportId: true, logoUrl: true },
            })
          : Promise.resolve([]),
      ]);

      const sports = sportsRows.map((s) => ({
        id: s.id,
        label: s.name,
        sortOrder: s.sortOrder,
        // sport-wide follow only when there's no more-specific entry
        followedWhole: subs.some(
          (sub) =>
            sub.category === s.id &&
            (sub.entityType === 'category' || sub.entityId === sub.category),
        ),
        competitions: compsRows
          .filter((c) => c.sportId === s.id)
          .map((c) => ({
            id: c.id,
            label: c.displayName ?? c.name,
            logoUrl: c.logoUrl,
            country: c.country,
          })),
        teams: teamsRows
          .filter((t) => t.sportId === s.id)
          .map((t) => ({
            id: t.id,
            label: t.name,
            shortName: t.shortName,
            logoUrl: t.logoUrl,
          })),
      }));

      return {
        totalFollows: subs.length,
        sports,
        source: 'db',
      };
    },
  );

  app.get(
    '/api/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary: 'Current user profile',
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              name: { type: 'string' },
              image: { type: ['string', 'null'] },
              timezone: { type: 'string' },
              onboardingDone: { type: 'boolean' },
            },
          },
          401: errorSchema,
        },
      },
    },
    async (req) => {
      const user = req.sessionUser!;
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        image: row.image ?? null,
        timezone: row.timezone,
        onboardingDone: row.onboardingDone,
      };
    },
  );

  app.patch(
    '/api/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary: 'Update profile (name, timezone)',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            timezone: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { name?: string; timezone?: string };
      const row = await prisma.user.update({
        where: { id: req.sessionUser!.id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.timezone ? { timezone: body.timezone } : {}),
        },
      });
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        image: row.image ?? null,
        timezone: row.timezone,
        onboardingDone: row.onboardingDone,
      };
    },
  );

  app.post(
    '/api/me/onboarding/complete',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary: 'Complete onboarding and optionally seed sport subscriptions',
        body: {
          type: 'object',
          properties: {
            timezone: { type: 'string' },
            sports: {
              type: 'array',
              items: {
                type: 'object',
                required: ['category', 'entityType', 'entityId', 'entityName'],
                properties: {
                  category: { type: 'string' },
                  entityType: { type: 'string' },
                  entityId: { type: 'string' },
                  entityName: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const userId = req.sessionUser!.id;
      const body = (req.body ?? {}) as {
        sports?: Array<{
          category: string;
          entityType: string;
          entityId: string;
          entityName: string;
        }>;
        timezone?: string;
      };

      if (body.timezone) {
        await prisma.user.update({
          where: { id: userId },
          data: { timezone: body.timezone },
        });
      }

      if (Array.isArray(body.sports) && body.sports.length > 0) {
        for (const sport of body.sports) {
          await prisma.userSubscription.upsert({
            where: {
              userId_category_entityId: {
                userId,
                category: sport.category,
                entityId: sport.entityId,
              },
            },
            create: {
              userId,
              category: sport.category,
              entityType: sport.entityType,
              entityId: sport.entityId,
              entityName: sport.entityName,
            },
            update: {
              entityName: sport.entityName,
              isActive: true,
            },
          });
        }
      }

      await prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });

      const user = await prisma.user.update({
        where: { id: userId },
        data: { onboardingDone: true },
      });

      return {
        id: user.id,
        onboardingDone: user.onboardingDone,
        timezone: user.timezone,
      };
    },
  );

  app.get(
    '/api/me/preferences',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['notifications'],
        security: [{ bearerAuth: [] }],
        summary: 'Get notification preferences',
      },
    },
    async (req) => {
      const userId = req.sessionUser!.id;
      const prefs = await prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      return serializePrefs(prefs);
    },
  );

  app.patch(
    '/api/me/preferences',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['notifications'],
        security: [{ bearerAuth: [] }],
        summary: 'Update notification preferences',
        body: {
          type: 'object',
          properties: {
            channels: {
              type: 'object',
              properties: {
                push: { type: 'boolean' },
                whatsapp: { type: 'boolean' },
                telegram: { type: 'boolean' },
              },
            },
            briefTime: { type: 'string', description: 'HH:mm' },
            maxDailyPush: { type: 'integer' },
            dndStart: { type: 'string', description: 'HH:mm' },
            dndEnd: { type: 'string', description: 'HH:mm' },
            preEventMins: { type: 'integer' },
            categoryPrefs: { type: 'object' },
          },
        },
      },
    },
    async (req) => {
      const userId = req.sessionUser!.id;
      const body = (req.body ?? {}) as {
        channels?: Record<string, boolean>;
        briefTime?: string;
        maxDailyPush?: number;
        dndStart?: string;
        dndEnd?: string;
        preEventMins?: number;
        categoryPrefs?: Record<string, unknown>;
      };

      const channels = body.channels as Prisma.InputJsonValue | undefined;
      const categoryPrefs = body.categoryPrefs as Prisma.InputJsonValue | undefined;

      const prefs = await prisma.notificationPreference.upsert({
        where: { userId },
        create: {
          userId,
          ...(channels ? { channels } : {}),
          ...(body.briefTime ? { briefTime: parseTimeToDate(body.briefTime) } : {}),
          ...(body.dndStart ? { dndStart: parseTimeToDate(body.dndStart) } : {}),
          ...(body.dndEnd ? { dndEnd: parseTimeToDate(body.dndEnd) } : {}),
          ...(typeof body.maxDailyPush === 'number'
            ? { maxDailyPush: body.maxDailyPush }
            : {}),
          ...(typeof body.preEventMins === 'number'
            ? { preEventMins: body.preEventMins }
            : {}),
          ...(categoryPrefs ? { categoryPrefs } : {}),
        },
        update: {
          ...(channels ? { channels } : {}),
          ...(body.briefTime ? { briefTime: parseTimeToDate(body.briefTime) } : {}),
          ...(body.dndStart ? { dndStart: parseTimeToDate(body.dndStart) } : {}),
          ...(body.dndEnd ? { dndEnd: parseTimeToDate(body.dndEnd) } : {}),
          ...(typeof body.maxDailyPush === 'number'
            ? { maxDailyPush: body.maxDailyPush }
            : {}),
          ...(typeof body.preEventMins === 'number'
            ? { preEventMins: body.preEventMins }
            : {}),
          ...(categoryPrefs ? { categoryPrefs } : {}),
        },
      });

      return serializePrefs(prefs);
    },
  );
}

function serializePrefs(prefs: {
  id: string;
  channels: unknown;
  briefTime: Date;
  maxDailyPush: number;
  dndStart: Date;
  dndEnd: Date;
  preEventMins: number;
  categoryPrefs: unknown;
}) {
  return {
    id: prefs.id,
    channels: prefs.channels,
    briefTime: formatTimeFromDate(prefs.briefTime),
    maxDailyPush: prefs.maxDailyPush,
    dndStart: formatTimeFromDate(prefs.dndStart),
    dndEnd: formatTimeFromDate(prefs.dndEnd),
    preEventMins: prefs.preEventMins,
    categoryPrefs: prefs.categoryPrefs,
  };
}
