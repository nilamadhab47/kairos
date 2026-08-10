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
} from '@kairo/queue';
import { sportsRouter } from '@kairo/sports';

type Sport = 'f1' | 'football' | 'cricket' | 'tennis';
const SUPPORTED: Sport[] = ['f1', 'football', 'cricket', 'tennis'];

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // Dev/ops triggers — allow in non-production without auth for local Scalar testing;
  // require auth in production.
  const guard =
    process.env.NODE_ENV === 'production'
      ? [app.authenticate]
      : [];

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
          jobId: `push:${notification.id}`,
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
