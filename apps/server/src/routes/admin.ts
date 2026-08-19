import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import {
  enqueueIngestSport,
  enqueueSchedulePreEvent,
  enqueueDeliverPush,
  ingestOpenF1Sessions,
  ingestFootballFixtures,
  ingestCricketMatches,
  ingestTennisMatches,
  isFootballConfigured,
  registerRepeatableJobs,
  unregisterRepeatableJobs,
  CURATED_FOOTBALL_LEAGUES,
  enrichLogosFromTheSportsDb,
  enqueueEnrichLogos,
  getEnrichLogosJob,
  generateStoryline,
  scoreEventForUser,
  stagesForScore,
  type StoryStage,
  horizonFor,
  computeNovelty,
  scoreForDiscovery,
  pickTopForDiscovery,
  generateDiscoveryPush,
  processScheduleDiscoveryJob,
  type DiscoveryCandidate,
  type StoryAngle,
} from '@kairo/queue';
import { sportsRouter, TheSportsDBProvider } from '@kairo/sports';

type Sport = 'f1' | 'football' | 'cricket' | 'tennis';
const SUPPORTED: Sport[] = ['f1', 'football', 'cricket', 'tennis'];

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // Dev/ops triggers — allow in non-production without auth for local Scalar testing;
  // require auth in production.
  const guard =
    process.env.NODE_ENV === 'production'
      ? [app.authenticate]
      : [];

  // Ops-only bypass for one-off backfill routes: a shared secret sent as
  // `X-Admin-Secret`. Enabled only when `ADMIN_BACKFILL_SECRET` is set on
  // the service — otherwise falls through to the normal auth guard, so
  // there's no way to accidentally leave it open.
  const backfillGuard = [
    async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
      const configured = process.env.ADMIN_BACKFILL_SECRET?.trim();
      if (configured) {
        const provided = (req.headers['x-admin-secret'] as string | undefined)?.trim();
        if (provided && provided === configured) return;
      }
      if (process.env.NODE_ENV !== 'production') return;
      await app.authenticate(req, reply);
    },
  ];

  // Preview the storyteller for a given (user, event). No push is sent —
  // this only calls Anthropic and returns the candidates so you can eyeball
  // copy quality before the real scheduler fires.
  //
  // Example:
  //   curl -X POST "$API/api/admin/push/storyline/preview" \
  //     -H "X-Admin-Secret: $ADMIN_BACKFILL_SECRET" \
  //     -H "Content-Type: application/json" \
  //     -d '{"userEmail":"you@example.com","eventId":"<event-id>"}'
  app.post(
    '/api/admin/push/storyline/preview',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Preview the multi-stage storyline for a given (user, event)',
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            userEmail: { type: 'string' },
            eventId: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const b = (req.body ?? {}) as {
        userId?: string;
        userEmail?: string;
        eventId?: string;
      };
      if (!b.eventId) {
        return reply.code(400).send({ error: 'missing_event_id' });
      }
      const user = b.userId
        ? await prisma.user.findUnique({
            where: { id: b.userId },
            include: { subscriptions: { where: { isActive: true } } },
          })
        : b.userEmail
          ? await prisma.user.findUnique({
              where: { email: b.userEmail },
              include: { subscriptions: { where: { isActive: true } } },
            })
          : null;
      if (!user) return reply.code(404).send({ error: 'user_not_found' });

      const event = await prisma.event.findUnique({ where: { id: b.eventId } });
      if (!event) return reply.code(404).send({ error: 'event_not_found' });

      const { score, reasons } = scoreEventForUser(event, user.subscriptions);
      const stages = stagesForScore(score);
      if (stages.length === 0) {
        return {
          eventId: event.id,
          score,
          reasons,
          stages: [],
          note: 'importance below any stage threshold — no push would be scheduled',
        };
      }

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

      const m = (event.metadata ?? {}) as {
        homeTeam?: { name?: string } | null;
        awayTeam?: { name?: string } | null;
        round?: string | null;
        venue?: string | null;
      };
      const home = m.homeTeam?.name ?? null;
      const away = m.awayTeam?.name ?? null;
      const competition =
        event.subtitle?.split(' · ')[0]?.trim() ?? null;

      const nowMs = Date.now();
      const minsUntilByStage: Record<StoryStage, number> = {
        morning_teaser: Math.round((event.startsAt.getTime() - nowMs) / 60_000),
        midday_hype: 300,
        pre_event: 15,
      };

      const storyline = await generateStoryline(
        {
          event: {
            id: event.id,
            sport: event.category,
            sportLabel: event.category,
            competition,
            homeTeam: home,
            awayTeam: away,
            round: m.round ?? null,
            venue: m.venue ?? null,
            startsAt: event.startsAt,
            isDerby: reasons.includes('derby'),
            isFinal: reasons.includes('final_or_semi'),
            prestige: reasons.includes('prestige_competition'),
          },
          user: {
            id: user.id,
            firstName: user.name?.split(' ')[0]?.trim() ?? null,
            followedTeams: teamRows.map((t) => t.name),
            followedCompetitions: compRows.map((c) => c.name),
            followedSports: user.subscriptions
              .filter((s) => s.entityType === 'sport')
              .map((s) => s.category),
          },
          stages,
          seed: `${user.id}:${event.id}`,
        },
        minsUntilByStage,
      );

      return { eventId: event.id, score, reasons, stages, storyline };
    },
  );

  // ---------- Discovery layer (upcoming-events briefing) ---------------------

  // Dry-run: what would today's discovery briefing look like for a user?
  // Returns the ranked candidate events + full copy candidates for the top
  // picks, WITHOUT persisting notifications or enqueueing anything.
  //
  //   curl -X POST "$API/api/admin/push/discovery/preview" \
  //     -H "X-Admin-Secret: $ADMIN_BACKFILL_SECRET" \
  //     -H "Content-Type: application/json" \
  //     -d '{"userEmail":"nil@joincruit.com"}'
  app.post(
    '/api/admin/push/discovery/preview',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Dry-run the discovery briefing selection for a user',
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            userEmail: { type: 'string' },
            max: { type: 'integer', minimum: 1, maximum: 5 },
          },
        },
      },
    },
    async (req, reply) => {
      const b = (req.body ?? {}) as { userId?: string; userEmail?: string; max?: number };
      const user = b.userId
        ? await prisma.user.findUnique({
            where: { id: b.userId },
            include: {
              subscriptions: { where: { isActive: true } },
              notificationPreference: true,
            },
          })
        : b.userEmail
          ? await prisma.user.findUnique({
              where: { email: b.userEmail },
              include: {
                subscriptions: { where: { isActive: true } },
                notificationPreference: true,
              },
            })
          : null;
      if (!user) return reply.code(404).send({ error: 'user_not_found' });

      const tz = user.timezone?.trim() || 'UTC';
      const now = new Date();
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

      const eventIds = events.map((e) => e.id);
      const priors = await prisma.notification.findMany({
        where: { userId: user.id, channel: 'push', eventId: { in: eventIds } },
        select: { eventId: true, type: true, createdAt: true, title: true },
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
      const scored: (DiscoveryCandidate & { skipped?: string })[] = [];

      for (const event of events) {
        const horizon = horizonFor(event.startsAt, now, tz);
        if (!horizon) continue;

        const prior = priorByEvent.get(event.id) ?? [];
        const hasStoryline = prior.some((p) =>
          ['morning_teaser', 'midday_hype', 'pre_event'].includes(p.type),
        );
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

        const s = scoreForDiscovery(event, user.subscriptions, horizon, novelty);
        const compTag = (event.contextTags ?? []).find((t) => t.startsWith('competition:'));
        const cand: DiscoveryCandidate & { skipped?: string } = {
          event,
          horizon,
          ...s,
          competitionId: compTag ? compTag.slice('competition:'.length) : null,
        };
        if (novelty === 0) cand.skipped = hasStoryline ? 'storyline_already_owns' : 'notified_recently';
        else if (s.total < 45) cand.skipped = 'below_threshold';
        scored.push(cand);
      }

      const picked = pickTopForDiscovery(
        scored.filter((c) => !c.skipped),
        Math.min(b.max ?? 3, 5),
      );

      // Generate copy for each pick — same path the real job takes.
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
      const storyUser = {
        id: user.id,
        firstName: user.name?.split(' ')[0]?.trim() ?? null,
        followedTeams: teamRows.map((t) => t.name),
        followedCompetitions: compRows.map((c) => c.name),
        followedSports: user.subscriptions
          .filter((s) => s.entityType === 'sport')
          .map((s) => s.category),
      };

      const usedAngles: StoryAngle[] = [];
      const briefing: Array<Record<string, unknown>> = [];
      for (const p of picked) {
        const m = (p.event.metadata ?? {}) as {
          homeTeam?: { name?: string } | null;
          awayTeam?: { name?: string } | null;
          round?: string | null;
        };
        const chapterRows = await prisma.notification.findMany({
          where: { userId: user.id, eventId: p.event.id, type: 'discovery' },
          orderBy: { createdAt: 'asc' },
          select: { title: true },
          take: 5,
        });
        const gen = await generateDiscoveryPush({
          event: {
            id: p.event.id,
            sport: p.event.category,
            sportLabel: p.event.category,
            competition: p.event.subtitle?.split(' · ')[0]?.trim() ?? null,
            homeTeam: m.homeTeam?.name ?? null,
            awayTeam: m.awayTeam?.name ?? null,
            round: m.round ?? null,
            startsAt: p.event.startsAt,
            isDerby: p.importanceReasons.includes('derby'),
            isFinal: p.importanceReasons.includes('final_or_semi'),
            prestige: p.importanceReasons.includes('prestige_competition'),
          },
          user: storyUser,
          horizon: p.horizon,
          usedAngles,
          previousChapters: chapterRows.map((r) => r.title),
          seed: `${user.id}:${p.event.id}:preview`,
        });
        if (gen) usedAngles.push(gen.chosen.angle);
        briefing.push({
          eventId: p.event.id,
          horizon: p.horizon,
          score: p.total,
          scoreBreakdown: {
            importance: p.importance,
            horizon: p.horizonWeight,
            novelty: p.novelty,
            reasons: p.importanceReasons,
          },
          title: p.event.title,
          startsAt: p.event.startsAt,
          copy: gen?.chosen ?? null,
          candidates: gen?.candidates ?? [],
        });
      }

      return {
        userId: user.id,
        timezone: tz,
        eventsInWindow: events.length,
        scoredCount: scored.length,
        skipped: scored
          .filter((c) => c.skipped)
          .map((c) => ({ eventId: c.event.id, reason: c.skipped, score: c.total })),
        briefing,
      };
    },
  );

  // Trigger the discovery briefing job for ALL eligible users immediately.
  // Same code path as the repeatable cron, just fired ad-hoc.
  //
  //   curl -X POST "$API/api/admin/push/discovery/run" \
  //     -H "X-Admin-Secret: $ADMIN_BACKFILL_SECRET"
  app.post(
    '/api/admin/push/discovery/run',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Force-run the discovery briefing job immediately (all users)',
      },
    },
    async () => {
      const result = await processScheduleDiscoveryJob();
      return result;
    },
  );

  // Fire a real push at a specific user to end-to-end test the pipeline
  // (Expo → FCM/APNS → device). Behind the X-Admin-Secret guard so you can
  // hit it from anywhere without a session — perfect for smoke-testing
  // after a deploy.
  //
  // Example:
  //   curl -X POST "$API/api/admin/push/test" \
  //     -H "X-Admin-Secret: $ADMIN_BACKFILL_SECRET" \
  //     -H "Content-Type: application/json" \
  //     -d '{"userEmail":"nil@joincruit.com"}'
  //
  // The returned `notificationId` is what you pass to
  // GET /api/admin/push/health (or query the DB directly) to see the
  // full lifecycle: sent → delivered (after ~15 min receipt poll).
  app.post(
    '/api/admin/push/test',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Enqueue a real Expo push to a user for smoke-testing',
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            userEmail: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const b = (req.body ?? {}) as {
        userId?: string;
        userEmail?: string;
        title?: string;
        body?: string;
      };

      const user = b.userId
        ? await prisma.user.findUnique({ where: { id: b.userId } })
        : b.userEmail
          ? await prisma.user.findUnique({ where: { email: b.userEmail } })
          : null;

      if (!user) {
        return reply.code(404).send({
          error: 'user_not_found',
          message: 'Provide `userId` or `userEmail` for an existing user.',
        });
      }

      const devices = await prisma.userDevice.findMany({
        where: { userId: user.id, isActive: true },
      });
      if (devices.length === 0) {
        return reply.code(400).send({
          error: 'no_devices',
          message:
            'User has no active push devices. Open the app on a signed-in device to register a token.',
        });
      }

      const notification = await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'test',
          channel: 'push',
          title: b.title ?? 'Kairos push test',
          body:
            b.body ??
            `If you can read this on your lockscreen, delivery is working. ${new Date().toLocaleTimeString()}`,
          aiGenerated: false,
          status: 'pending',
          scheduledFor: new Date(),
        },
      });

      const job = await enqueueDeliverPush(
        { notificationId: notification.id },
        { jobId: `push_${notification.id}` },
      );

      return {
        ok: true,
        notificationId: notification.id,
        userId: user.id,
        activeDevices: devices.map((d) => ({
          id: d.id,
          platform: d.platform,
          deviceName: d.deviceName,
          tokenPrefix: d.expoPushToken.slice(0, 20),
        })),
        job,
        followUp: {
          checkStatus: `GET /api/admin/push/health`,
          expectedFlow:
            'status: pending → sent (within seconds) → delivered (after ~15 min, once the receipt poller runs)',
        },
      };
    },
  );

  // Fast operational rollup for push delivery. Non-destructive, and cheap
  // enough to hit from the Railway logs UI whenever a delivery looks off.
  app.get(
    '/api/admin/push/health',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Push notification delivery health (last 24h + last 100 rows)',
      },
    },
    async () => {
      const since = new Date(Date.now() - 24 * 60 * 60_000);
      const rows = await prisma.notification.groupBy({
        by: ['status'],
        where: { channel: 'push', createdAt: { gte: since } },
        _count: true,
      });
      const errorBreakdown = await prisma.notification.groupBy({
        by: ['ticketError'],
        where: { channel: 'push', createdAt: { gte: since }, ticketError: { not: null } },
        _count: true,
      });
      const receiptBreakdown = await prisma.notification.groupBy({
        by: ['receiptError'],
        where: { channel: 'push', createdAt: { gte: since }, receiptError: { not: null } },
        _count: true,
      });
      const recent = await prisma.notification.findMany({
        where: { channel: 'push' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          aiGenerated: true,
          scheduledFor: true,
          sentAt: true,
          receiptCheckedAt: true,
          attemptCount: true,
          ticketError: true,
          receiptError: true,
          errorMsg: true,
        },
      });
      const totals = Object.fromEntries(rows.map((r) => [r.status, r._count]));
      return {
        window: '24h',
        totals,
        ticketErrors: errorBreakdown.map((r) => ({ error: r.ticketError, count: r._count })),
        receiptErrors: receiptBreakdown.map((r) => ({ error: r.receiptError, count: r._count })),
        recent,
      };
    },
  );

  app.post(
    '/api/admin/ingest',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Run sports ingest per sport (async by default, sync=true for immediate response)',
        body: {
          type: 'object',
          properties: {
            sport: { type: 'string', enum: SUPPORTED },
            sports: {
              type: 'array',
              items: { type: 'string', enum: SUPPORTED },
            },
            season: { type: 'integer' },
            leagueIds: { type: 'array', items: { type: 'integer' } },
            cricketSegment: { type: 'string', enum: ['upcoming', 'live', 'all'] },
            tennisDaysAhead: { type: 'integer', minimum: 1, maximum: 14 },
            year: { type: 'integer' },
            sync: { type: 'boolean', description: 'Run ingest inline (returns results); default true in dev' },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as {
        sport?: Sport;
        sports?: Sport[];
        season?: number;
        leagueIds?: number[];
        cricketSegment?: 'upcoming' | 'live' | 'all';
        tennisDaysAhead?: number;
        year?: number;
        sync?: boolean;
      };

      const targets: Sport[] = body.sport
        ? [body.sport]
        : body.sports && body.sports.length > 0
        ? body.sports
        : SUPPORTED;

      const enqueued: Array<{ sport: Sport; id: string }> = [];
      for (const sport of targets) {
        const job = await enqueueIngestSport({
          sport,
          season: body.season,
          leagueIds: body.leagueIds,
          cricketSegment: body.cricketSegment,
          tennisDaysAhead: body.tennisDaysAhead,
          year: body.year,
        });
        enqueued.push({ sport, id: job.id });
      }

      const runSync = body.sync !== false;
      let sync: Record<string, unknown> | undefined;
      if (runSync) {
        sync = {};
        for (const sport of targets) {
          try {
            if (sport === 'f1') {
              sync[sport] = await ingestOpenF1Sessions({ year: body.year });
            } else if (sport === 'football') {
              sync[sport] = await ingestFootballFixtures({
                season: body.season,
                leagueIds: body.leagueIds,
              });
            } else if (sport === 'cricket') {
              sync[sport] = await ingestCricketMatches({ segment: body.cricketSegment ?? 'all' });
            } else if (sport === 'tennis') {
              sync[sport] = await ingestTennisMatches({ daysAhead: body.tennisDaysAhead ?? 7 });
            }
          } catch (err) {
            sync[sport] = {
              failed: true,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
      }

      return { enqueued, sync };
    },
  );

  // One-shot backfill for F1 constructors (Ferrari, Red Bull, McLaren, …).
  // OpenF1 does not expose a `year`-only constructor endpoint, so we source
  // the grid from TheSportsDB and link each row to the F1 competition so the
  // mobile teams picker (filters by competitionId) can find them.
  app.post(
    '/api/admin/backfill/f1-constructors',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Populate F1 Team rows (constructors) and link to Formula 1 competition',
      },
    },
    async () => {
      const SHORT_NAME_ALIASES: Record<string, string> = {
        'Oracle Red Bull Racing': 'Red Bull',
        'Scuderia Ferrari HP': 'Ferrari',
        'McLaren Formula 1 Team': 'McLaren',
        'Mercedes-AMG PETRONAS Formula One Team': 'Mercedes',
        'Aston Martin Aramco Formula One Team': 'Aston Martin',
        'BWT Alpine Formula One Team': 'Alpine',
        'MoneyGram Haas F1 Team': 'Haas',
        'Visa Cash App Racing Bulls Formula One Team': 'Racing Bulls',
        'Audi Revolut F1 Team': 'Audi',
        'Cadillac Formula 1 Team': 'Cadillac',
        'Kick Sauber F1 Team': 'Sauber',
        'Stake F1 Team Kick Sauber': 'Sauber',
        'Williams Racing': 'Williams',
      };

      const provider = new TheSportsDBProvider();
      const constructors = await provider.fetchF1Constructors();
      if (constructors.length === 0) {
        return { ok: false, error: 'thesportsdb_returned_empty' };
      }

      // Ensure the F1 competition exists (created by seed:sports on boot).
      const f1Competition = await prisma.competition.findFirst({
        where: { sportId: 'f1' },
        orderBy: { createdAt: 'asc' },
      });

      let created = 0;
      let updated = 0;
      let linked = 0;

      for (const c of constructors) {
        const shortName = SHORT_NAME_ALIASES[c.name] ?? c.shortName ?? null;
        const providerRef = { provider: 'thesportsdb', externalId: c.externalId };

        const existingByRef = await prisma.team.findFirst({
          where: {
            sportId: 'f1',
            providerRefs: { array_contains: [providerRef] as unknown as object },
          },
        });
        const existing =
          existingByRef ??
          (await prisma.team.findFirst({ where: { sportId: 'f1', name: c.name } }));

        let teamId: string;
        if (existing) {
          const row = await prisma.team.update({
            where: { id: existing.id },
            data: {
              type: 'constructor',
              shortName: existing.shortName ?? shortName,
              logoUrl: existing.logoUrl ?? c.badgeUrl ?? c.logoUrl,
              country: existing.country ?? c.country,
              providerRefs: [providerRef] as unknown as object,
            },
          });
          teamId = row.id;
          updated += 1;
        } else {
          const row = await prisma.team.create({
            data: {
              sportId: 'f1',
              name: c.name,
              shortName,
              type: 'constructor',
              logoUrl: c.badgeUrl ?? c.logoUrl,
              country: c.country,
              providerRefs: [providerRef] as unknown as object,
            },
          });
          teamId = row.id;
          created += 1;
        }

        if (f1Competition) {
          await prisma.teamCompetition.upsert({
            where: {
              teamId_competitionId: { teamId, competitionId: f1Competition.id },
            },
            update: {},
            create: { teamId, competitionId: f1Competition.id },
          });
          linked += 1;
        }

        if (c.badgeUrl) {
          await prisma.asset
            .upsert({
              where: {
                entityType_entityId_assetType_provider: {
                  entityType: 'team',
                  entityId: teamId,
                  assetType: 'logo',
                  provider: 'thesportsdb',
                },
              },
              update: { url: c.badgeUrl },
              create: {
                entityType: 'team',
                entityId: teamId,
                assetType: 'logo',
                provider: 'thesportsdb',
                url: c.badgeUrl,
              },
            })
            .catch(() => undefined);
        }
      }

      return {
        ok: true,
        constructors: constructors.length,
        created,
        updated,
        linked,
        competitionId: f1Competition?.id ?? null,
      };
    },
  );

  // One-shot backfill for major football competitions the ingest wouldn't
  // spontaneously create because the current window has no fixtures (UCL
  // group stage hasn't started, Copa del Rey / Super Copa are seasonal, …).
  //
  // Each row is created with the ESPN `providerRef` for its slug, so when
  // ingest eventually returns fixtures for that league, `upsertCompetition`
  // finds the seeded row via provider-ref and merges into it — no duplicates.
  app.post(
    '/api/admin/backfill/football-competitions',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Seed missing football competitions so the picker lists them out-of-season',
      },
    },
    async () => {
      const SEEDS = [
        { name: 'UEFA Champions League', slug: 'uefa.champions', format: 'league', country: 'International' },
        { name: 'UEFA Europa League', slug: 'uefa.europa', format: 'league', country: 'International' },
        { name: 'UEFA Conference League', slug: 'uefa.europa.conf', format: 'league', country: 'International' },
        { name: 'FA Cup', slug: 'eng.fa', format: 'cup', country: 'England' },
        { name: 'Community Shield', slug: 'eng.charity', format: 'super-cup', country: 'England' },
        { name: 'Copa del Rey', slug: 'esp.copa_del_rey', format: 'cup', country: 'Spain' },
        { name: 'Supercopa de España', slug: 'esp.super_cup', format: 'super-cup', country: 'Spain' },
        { name: 'Coppa Italia', slug: 'ita.coppa_italia', format: 'cup', country: 'Italy' },
        { name: 'DFB-Pokal', slug: 'ger.dfb_pokal', format: 'cup', country: 'Germany' },
        { name: 'FIFA World Cup', slug: 'fifa.world', format: 'cup', country: 'International' },
      ];

      let created = 0;
      let alreadyPresent = 0;
      for (const s of SEEDS) {
        const providerRef = { provider: 'ESPN', externalId: s.slug };

        // Match on provider-ref OR exact name — never duplicate an existing row.
        const rows = await prisma.competition.findMany({
          where: { sportId: 'football' },
          select: { id: true, name: true, providerRefs: true },
        });
        const existing = rows.find((c) => {
          if (c.name === s.name) return true;
          const refs = Array.isArray(c.providerRefs) ? (c.providerRefs as Array<{ provider: string; externalId: string }>) : [];
          return refs.some((r) => r.provider === 'ESPN' && r.externalId === s.slug);
        });

        if (existing) {
          const refs = Array.isArray(existing.providerRefs)
            ? (existing.providerRefs as Array<{ provider: string; externalId: string }>)
            : [];
          if (!refs.some((r) => r.provider === 'ESPN' && r.externalId === s.slug)) {
            refs.push(providerRef);
            await prisma.competition.update({
              where: { id: existing.id },
              data: { providerRefs: refs as unknown as object },
            });
          }
          alreadyPresent += 1;
          continue;
        }

        await prisma.competition.create({
          data: {
            sportId: 'football',
            name: s.name,
            displayName: s.name,
            format: s.format,
            country: s.country,
            isActive: true,
            providerRefs: [providerRef] as unknown as object,
          },
        });
        created += 1;
      }

      return { ok: true, created, alreadyPresent, total: SEEDS.length };
    },
  );

  // One-shot backfill for cricket teams (national + IPL franchises). The free
  // Cricbuzz tier only ingests today's live matches, so onboarding pickers see
  // an empty catalog. This seeds the well-known teams and links them to
  // dedicated competitions so the mobile picker (filters by competitionId)
  // shows a proper roster. Logos are filled by TheSportsDB via searchteams.
  app.post(
    '/api/admin/backfill/cricket-teams',
    {
      preHandler: backfillGuard,
      schema: {
        tags: ['admin'],
        summary: 'Seed international cricket nations + IPL franchises',
      },
    },
    async () => {
      type Seed = { name: string; shortName: string; country?: string };

      const NATIONS: Seed[] = [
        { name: 'India', shortName: 'IND', country: 'India' },
        { name: 'Australia', shortName: 'AUS', country: 'Australia' },
        { name: 'England', shortName: 'ENG', country: 'England' },
        { name: 'Pakistan', shortName: 'PAK', country: 'Pakistan' },
        { name: 'New Zealand', shortName: 'NZ', country: 'New Zealand' },
        { name: 'South Africa', shortName: 'SA', country: 'South Africa' },
        { name: 'Sri Lanka', shortName: 'SL', country: 'Sri Lanka' },
        { name: 'Bangladesh', shortName: 'BAN', country: 'Bangladesh' },
        { name: 'West Indies', shortName: 'WI', country: 'West Indies' },
        { name: 'Afghanistan', shortName: 'AFG', country: 'Afghanistan' },
        { name: 'Zimbabwe', shortName: 'ZIM', country: 'Zimbabwe' },
        { name: 'Ireland', shortName: 'IRE', country: 'Ireland' },
      ];

      const IPL: Seed[] = [
        { name: 'Mumbai Indians', shortName: 'MI', country: 'India' },
        { name: 'Chennai Super Kings', shortName: 'CSK', country: 'India' },
        { name: 'Royal Challengers Bengaluru', shortName: 'RCB', country: 'India' },
        { name: 'Kolkata Knight Riders', shortName: 'KKR', country: 'India' },
        { name: 'Delhi Capitals', shortName: 'DC', country: 'India' },
        { name: 'Punjab Kings', shortName: 'PBKS', country: 'India' },
        { name: 'Rajasthan Royals', shortName: 'RR', country: 'India' },
        { name: 'Sunrisers Hyderabad', shortName: 'SRH', country: 'India' },
        { name: 'Gujarat Titans', shortName: 'GT', country: 'India' },
        { name: 'Lucknow Super Giants', shortName: 'LSG', country: 'India' },
      ];

      async function ensureComp(name: string, format: string) {
        const existing = await prisma.competition.findFirst({
          where: { sportId: 'cricket', name },
        });
        if (existing) return existing;
        return prisma.competition.create({
          data: {
            sportId: 'cricket',
            name,
            displayName: name,
            format,
            isActive: true,
            providerRefs: [] as unknown as object,
          },
        });
      }

      async function upsertTeam(
        seed: Seed,
        type: 'national' | 'franchise',
        competitionId: string,
      ): Promise<'created' | 'updated'> {
        const existing = await prisma.team.findFirst({
          where: { sportId: 'cricket', name: seed.name },
        });
        let teamId: string;
        let outcome: 'created' | 'updated';
        if (existing) {
          const row = await prisma.team.update({
            where: { id: existing.id },
            data: {
              type,
              shortName: existing.shortName ?? seed.shortName,
              country: existing.country ?? seed.country,
            },
          });
          teamId = row.id;
          outcome = 'updated';
        } else {
          const row = await prisma.team.create({
            data: {
              sportId: 'cricket',
              name: seed.name,
              shortName: seed.shortName,
              type,
              country: seed.country,
              providerRefs: [] as unknown as object,
            },
          });
          teamId = row.id;
          outcome = 'created';
        }
        await prisma.teamCompetition.upsert({
          where: { teamId_competitionId: { teamId, competitionId } },
          update: {},
          create: { teamId, competitionId },
        });
        return outcome;
      }

      const intlComp = await ensureComp('International', 'international');
      const iplComp = await ensureComp('Indian Premier League', 'franchise');

      let created = 0;
      let updated = 0;
      for (const n of NATIONS) {
        const r = await upsertTeam(n, 'national', intlComp.id);
        if (r === 'created') created += 1;
        else updated += 1;
      }
      for (const t of IPL) {
        const r = await upsertTeam(t, 'franchise', iplComp.id);
        if (r === 'created') created += 1;
        else updated += 1;
      }

      // Best-effort logo enrichment via TheSportsDB — never blocks the seed.
      let enriched = 0;
      const provider = new TheSportsDBProvider();
      const allSeeds: Array<Seed & { comp: string; type: 'national' | 'franchise' }> = [
        ...NATIONS.map((n) => ({ ...n, comp: intlComp.id, type: 'national' as const })),
        ...IPL.map((t) => ({ ...t, comp: iplComp.id, type: 'franchise' as const })),
      ];
      for (const seed of allSeeds) {
        try {
          const matches = await provider.fetchTeams({ query: seed.name, sport: 'cricket' });
          const hit = matches.find((m) => m.name.toLowerCase() === seed.name.toLowerCase()) ??
            matches[0];
          if (!hit?.logoUrl) continue;
          const team = await prisma.team.findFirst({
            where: { sportId: 'cricket', name: seed.name },
            select: { id: true, logoUrl: true },
          });
          if (!team) continue;
          if (!team.logoUrl) {
            await prisma.team.update({
              where: { id: team.id },
              data: { logoUrl: hit.logoUrl },
            });
            enriched += 1;
          }
        } catch {
          // Rate-limits and 404s are non-fatal here.
        }
      }

      return {
        ok: true,
        competitions: { international: intlComp.id, ipl: iplComp.id },
        created,
        updated,
        logosEnriched: enriched,
        totalSeeded: NATIONS.length + IPL.length,
      };
    },
  );

  app.post(
    '/api/admin/schedule-pre-event',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Scan upcoming events and schedule pre-event push jobs',
        body: {
          type: 'object',
          properties: {
            windowMins: { type: 'integer' },
            sync: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { windowMins?: number; sync?: boolean };
      const job = await enqueueSchedulePreEvent({ windowMins: body.windowMins });
      let sync: { created: number } | undefined;
      if (body.sync !== false) {
        const { processSchedulePreEventJob } = await import('@kairo/queue');
        sync = await processSchedulePreEventJob({ windowMins: body.windowMins });
      }
      return { enqueued: job, sync };
    },
  );

  app.post(
    '/api/admin/enrich-logos',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary:
          'Fill missing team/competition logoUrl from TheSportsDB (async by default; sync=true runs inline)',
        body: {
          type: 'object',
          properties: {
            competitionLimit: { type: 'integer', minimum: 0, maximum: 200 },
            teamLimit: { type: 'integer', minimum: 0, maximum: 200 },
            upcomingOnly: { type: 'boolean' },
            sync: {
              type: 'boolean',
              description:
                'Run inline and wait for full result. Defaults to false — job is enqueued and result is polled via GET /api/admin/enrich-logos/:id.',
            },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as {
        competitionLimit?: number;
        teamLimit?: number;
        upcomingOnly?: boolean;
        sync?: boolean;
      };
      const { sync, ...jobData } = body;

      if (sync) {
        const result = await enrichLogosFromTheSportsDb(jobData);
        return { mode: 'sync', result };
      }

      const job = await enqueueEnrichLogos(jobData);
      return {
        mode: 'async',
        job,
        pollAt: `/api/admin/enrich-logos/${job.id}`,
        hint: 'Rate-limited to 30 req/min against TheSportsDB — poll every 30s until state=completed.',
      };
    },
  );

  app.get(
    '/api/admin/enrich-logos/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Poll an async enrich-logos job.',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const status = await getEnrichLogosJob(id);
      if (!status) return reply.code(404).send({ error: 'job_not_found', id });
      return status;
    },
  );

  app.post(
    '/api/admin/push/smoke',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Enqueue a test push to a user (default delay 10s) for real-device smoke',
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'Target user id (required in unauthenticated local mode)' },
            delaySeconds: { type: 'integer', minimum: 0, maximum: 3600 },
            sync: {
              type: 'boolean',
              description: 'When delaySeconds=0, also deliver inline',
            },
          },
        },
      },
    },
    async (req, reply) => {
      const body = (req.body ?? {}) as {
        userId?: string;
        delaySeconds?: number;
        sync?: boolean;
      };
      const userId = body.userId ?? req.sessionUser?.id;
      if (!userId) {
        return reply.code(400).send({ error: 'userId_required' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: 'user_not_found' });

      const devices = await prisma.userDevice.findMany({
        where: { userId, isActive: true },
        select: { id: true, platform: true, expoPushToken: true },
      });
      if (devices.length === 0) {
        return reply.code(400).send({ error: 'no_active_devices' });
      }

      const delaySeconds = body.delaySeconds ?? 10;
      const scheduledFor = new Date(Date.now() + delaySeconds * 1000);
      const notification = await prisma.notification.create({
        data: {
          userId,
          type: 'smoke',
          channel: 'push',
          title: 'Kairo smoke test',
          body: 'If you see this, Expo push delivery works.',
          aiGenerated: false,
          status: 'pending',
          scheduledFor,
        },
      });

      const enqueued = await enqueueDeliverPush(
        { notificationId: notification.id },
        {
          delay: Math.max(0, delaySeconds * 1000),
          jobId: `push_${notification.id}`,
        },
      );

      let sync: { sent: number; failed: number } | undefined;
      if (body.sync && delaySeconds === 0) {
        const { processDeliverPushJob } = await import('@kairo/queue');
        sync = await processDeliverPushJob({ notificationId: notification.id });
      }

      return {
        notificationId: notification.id,
        delaySeconds,
        devices: devices.length,
        enqueued,
        sync,
      };
    },
  );

  app.post(
    '/api/admin/scheduler/enable',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Register recurring ingest + pre-event jobs (idempotent)',
      },
    },
    async () => ({ repeats: await registerRepeatableJobs() }),
  );

  app.post(
    '/api/admin/scheduler/disable',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Remove all repeatable jobs (recurring ingest halted until re-enabled)',
      },
    },
    async () => {
      await unregisterRepeatableJobs();
      return { ok: true };
    },
  );

  app.get(
    '/api/admin/health/providers',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Live health probe of every registered sports provider (real API calls)',
      },
    },
    async () => {
      const probe = await sportsRouter.runHealthProbe();
      const summary = sportsRouter.listProviders();
      return {
        checkedAt: new Date().toISOString(),
        providers: summary.map((s) => {
          const p = probe.find((r) => r.name === s.name);
          return { ...s, ok: p?.healthy ?? s.healthy, error: p?.error ?? s.lastError };
        }),
      };
    },
  );

  app.get(
    '/api/admin/health/ingest',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Current DB inventory of ingested sports data (real rows).',
      },
    },
    async () => {
      const [sports, competitions, teams, matches, standings, assets] = await Promise.all([
        prisma.sport.count(),
        prisma.competition.count(),
        prisma.team.count(),
        prisma.match.count(),
        prisma.standing.count(),
        prisma.asset.count(),
      ]);
      const upcoming = await prisma.match.groupBy({
        by: ['sportId'],
        _count: { _all: true },
        where: { startsAt: { gte: new Date() } },
      });
      const latest = await prisma.match.findFirst({
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true, sportId: true },
      });
      return {
        counts: { sports, competitions, teams, matches, standings, assets },
        upcomingBySport: Object.fromEntries(upcoming.map((r) => [r.sportId, r._count._all])),
        lastMatchSyncedAt: latest?.lastSyncedAt?.toISOString() ?? null,
        lastMatchSyncedSport: latest?.sportId ?? null,
      };
    },
  );

  app.get(
    '/api/admin/integrations',
    {
      schema: {
        tags: ['admin'],
        summary: 'Which third-party integrations are configured (no secrets returned)',
      },
    },
    async () => ({
      openf1: {
        configured: true,
        baseUrl: process.env.OPENF1_BASE_URL ?? 'https://api.openf1.org/v1',
        note: 'No API key required',
      },
      apiFootball: {
        configured: isFootballConfigured(),
        baseUrl: process.env.API_FOOTBALL_BASE_URL ?? 'https://v3.football.api-sports.io',
        curatedLeagues: CURATED_FOOTBALL_LEAGUES.length,
      },
      rapidapi: {
        configured: Boolean(process.env.RAPIDAPI_KEY?.trim()),
        note: 'shared by Cricbuzz + SportAPI7',
      },
      sportmonks: { configured: Boolean(process.env.SPORTMONKS_API_TOKEN?.trim()) },
      cricketData: { configured: Boolean(process.env.CRICKETDATA_API_KEY?.trim()) },
      espn: { configured: true, note: 'no key required — public endpoints, rate-limited to 30/min per host' },
      theSportsDb: {
        configured: true,
        apiKeySet: Boolean(process.env.THESPORTSDB_API_KEY?.trim()),
        note: 'Logo/badge enrichment; free key "3" used if unset',
      },
      expoPush: {
        accessTokenConfigured: Boolean(process.env.EXPO_ACCESS_TOKEN?.trim()),
        note: 'Push works without token for light use; token recommended in prod',
      },
      openRouter: { configured: Boolean(process.env.OPEN_ROUTER_API_KEY?.trim()) },
      anthropic: { configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) },
      twilioWhatsapp: {
        configured: Boolean(
          process.env.TWILIO_ACCOUNT_SID?.trim() &&
            process.env.TWILIO_AUTH_TOKEN?.trim() &&
            process.env.TWILIO_WHATSAPP_FROM?.trim(),
        ),
      },
      telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()) },
      googleCalendar: {
        configured: Boolean(
          process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
            process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim(),
        ),
      },
      googleOAuth: {
        configured: Boolean(
          process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
        ),
      },
    }),
  );
}
