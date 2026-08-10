import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { sportsRouter, THESPORTSDB_LICENSE_NOTE } from '@kairo/sports';
import {
  competitionFamilyIds,
  pickCanonicalCompetitions,
} from '../lib/competitions.js';

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/catalog/attribution',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Trademark / artwork attribution copy for Settings & About',
      },
    },
    async () => ({
      licenseNote: THESPORTSDB_LICENSE_NOTE,
      sources: [
        {
          name: 'TheSportsDB',
          role: 'competition and team badges when missing from primary providers',
        },
        {
          name: 'ESPN',
          role: 'football team logos via scoreboard ingest',
        },
      ],
    }),
  );

  app.get(
    '/api/catalog/sports',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Sport taxonomy (real, from DB). Data availability from provider health.',
      },
    },
    async () => {
      const sports = await prisma.sport.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      const healthByProvider = new Map(
        sportsRouter.listProviders().map((p) => [p.name, p]),
      );

      const results = [];
      for (const s of sports) {
        const providers = sportsRouter.getProvidersForSport(s.id as any);
        const hasHealthyProvider = providers.some(
          (p) => healthByProvider.get(p.config.name)?.healthy !== false,
        );
        const [matchCount, teamCount] = await Promise.all([
          prisma.match.count({ where: { sportId: s.id } }),
          prisma.team.count({ where: { sportId: s.id } }),
        ]);
        results.push({
          category: s.id,
          label: s.name,
          providers: providers.map((p) => p.config.name),
          hasHealthyProvider,
          matchCount,
          teamCount,
          status: hasHealthyProvider && matchCount > 0 ? 'live' : hasHealthyProvider ? 'ready' : 'unavailable',
        });
      }

      return { sports: results };
    },
  );

  app.get(
    '/api/catalog/competitions',
    {
      schema: {
        tags: ['catalog'],
        summary:
          'Competitions per sport with normalized display fields (format, gender, season). Deduplicates season clones by default.',
        querystring: {
          type: 'object',
          required: ['category'],
          properties: {
            category: { type: 'string' },
            q: { type: 'string', description: 'Free-text search across name + displayName' },
            format: {
              type: 'string',
              description:
                'Filter by normalized format: e.g. cricket franchise|international|test|odi|t20i|t20; football league|cup; f1 championship; tennis grand-slam',
            },
            gender: { type: 'string', enum: ['men', 'women', 'mixed'] },
            dedupeBySeason: {
              type: 'boolean',
              default: true,
              description:
                'Collapse season repeats — one row per normalized displayName. Set false to see every season row.',
            },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        category,
        q,
        format,
        gender,
        dedupeBySeason = true,
        limit = 200,
      } = req.query as {
        category: string;
        q?: string;
        format?: string;
        gender?: 'men' | 'women' | 'mixed';
        dedupeBySeason?: boolean;
        limit?: number;
      };

      const sport = await prisma.sport.findUnique({ where: { id: category } });
      if (!sport) return reply.code(400).send({ error: 'unknown_sport' });

      const rows = await prisma.competition.findMany({
        where: {
          sportId: category,
          isActive: true,
          ...(format ? { format } : {}),
          ...(gender ? { gender } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { displayName: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        // Higher-tier first, rows with logos before those without, then A→Z.
        orderBy: [
          { tier: 'asc' },
          { logoUrl: { sort: 'asc', nulls: 'last' } },
          { displayName: { sort: 'asc', nulls: 'last' } },
          { name: 'asc' },
        ],
        // Over-fetch so we still hit `limit` unique rows after dedupe.
        take: dedupeBySeason ? Math.min(500, limit * 4) : limit,
      });

      const shaped = rows.map((c) => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName ?? c.name,
        shortName: c.shortName,
        country: c.country,
        logoUrl: c.logoUrl,
        season: c.season,
        seasonLabel: c.seasonLabel,
        format: c.format,
        gender: c.gender,
        tier: c.tier,
      }));

      let competitions = shaped;
      if (dedupeBySeason) {
        competitions = (await pickCanonicalCompetitions(shaped)).slice(0, limit);
      }

      return {
        competitions,
        count: competitions.length,
        source: 'db',
      };
    },
  );

  app.get(
    '/api/catalog/teams',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Search real ingested teams (never returns fabricated results).',
        querystring: {
          type: 'object',
          required: ['category'],
          properties: {
            category: { type: 'string' },
            q: { type: 'string' },
            competitionId: {
              type: 'string',
              description: 'Limit to teams that play in this competition',
            },
            type: {
              type: 'string',
              enum: ['club', 'national', 'franchise', 'constructor'],
              description:
                'Team category filter — e.g. `national` to show international sides only for cricket',
            },
            hasLogo: {
              type: 'boolean',
              description: 'Only teams with a logo (nice for pickers where crest matters)',
            },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        category,
        q,
        competitionId,
        type,
        hasLogo,
        limit = 100,
      } = req.query as {
        category: string;
        q?: string;
        competitionId?: string;
        type?: 'club' | 'national' | 'franchise' | 'constructor';
        hasLogo?: boolean;
        limit?: number;
      };
      const sport = await prisma.sport.findUnique({ where: { id: category } });
      if (!sport) return reply.code(400).send({ error: 'unknown_sport' });

      // Expand to season/provider clones so a stale La Liga id still returns
      // the full roster attached to the live season row.
      const competitionIds = competitionId
        ? await competitionFamilyIds(competitionId)
        : null;

      const teams = await prisma.team.findMany({
        where: {
          sportId: category,
          ...(type ? { type } : {}),
          ...(hasLogo ? { NOT: [{ logoUrl: null }, { logoUrl: '' }] } : {}),
          ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
          ...(competitionIds
            ? { competitions: { some: { competitionId: { in: competitionIds } } } }
            : {}),
        },
        // Teams with logos first, then alphabetical.
        orderBy: [{ logoUrl: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
        take: limit,
      });

      return {
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          shortName: t.shortName,
          type: t.type,
          country: t.country,
          logoUrl: t.logoUrl,
        })),
        count: teams.length,
        source: 'db',
      };
    },
  );

  app.get(
    '/api/catalog/entities',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Follow-target search across teams + competitions for a sport (real data only).',
        querystring: {
          type: 'object',
          required: ['category'],
          properties: {
            category: { type: 'string' },
            q: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { category, q } = req.query as { category: string; q?: string };
      const sport = await prisma.sport.findUnique({ where: { id: category } });
      if (!sport) return reply.code(400).send({ error: 'unknown_sport' });

      const [competitions, teams] = await Promise.all([
        prisma.competition.findMany({
          where: {
            sportId: category,
            isActive: true,
            ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
          },
          orderBy: [{ tier: 'asc' }, { name: 'asc' }],
          take: 20,
        }),
        prisma.team.findMany({
          where: {
            sportId: category,
            ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
          },
          orderBy: { name: 'asc' },
          take: 30,
        }),
      ]);

      const entities = [
        ...competitions.map((c) => ({
          category,
          entityType: 'competition' as const,
          entityId: c.id,
          entityName: c.name,
          entityMeta: { country: c.country, logo: c.logoUrl, season: c.season },
        })),
        ...teams.map((t) => ({
          category,
          entityType: 'team' as const,
          entityId: t.id,
          entityName: t.name,
          entityMeta: { country: t.country, logo: t.logoUrl, shortName: t.shortName },
        })),
      ];

      return {
        entities,
        source: 'db',
        counts: { competitions: competitions.length, teams: teams.length },
        hint: entities.length === 0
          ? 'No ingested data for this sport yet. Ingest jobs must populate teams/competitions first.'
          : undefined,
      };
    },
  );

  app.get(
    '/api/catalog/competitions/:id',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Competition detail from DB (real ingested row)',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const competition = await prisma.competition.findUnique({
        where: { id },
        include: {
          _count: { select: { matches: true, teams: true, standings: true } },
        },
      });
      if (!competition) return reply.code(404).send({ error: 'not_found' });

      const nextMatch = await prisma.match.findFirst({
        where: { competitionId: id, startsAt: { gte: new Date() }, status: { not: 'cancelled' } },
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true, status: true, homeTeamId: true, awayTeamId: true },
      });

      return {
        source: 'db',
        competition: {
          id: competition.id,
          sportId: competition.sportId,
          name: competition.name,
          shortName: competition.shortName,
          country: competition.country,
          logoUrl: competition.logoUrl,
          season: competition.season,
          tier: competition.tier,
          providerRefs: competition.providerRefs,
          matchCount: competition._count.matches,
          teamCount: competition._count.teams,
          standingSeasons: competition._count.standings,
          nextMatch: nextMatch
            ? {
                id: nextMatch.id,
                startsAt: nextMatch.startsAt.toISOString(),
                status: nextMatch.status,
              }
            : null,
        },
      };
    },
  );

  app.get(
    '/api/catalog/competitions/:id/standings',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Standings for a competition (real ingested rows only)',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            season: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { season } = req.query as { season?: string };

      const competition = await prisma.competition.findUnique({ where: { id } });
      if (!competition) return reply.code(404).send({ error: 'not_found' });

      const standing = season
        ? await prisma.standing.findUnique({
            where: { competitionId_season: { competitionId: id, season } },
            include: {
              rows: {
                include: {
                  team: { select: { id: true, name: true, shortName: true, logoUrl: true } },
                },
                orderBy: { position: 'asc' },
              },
            },
          })
        : await prisma.standing.findFirst({
            where: { competitionId: id },
            orderBy: { lastSyncedAt: 'desc' },
            include: {
              rows: {
                include: {
                  team: { select: { id: true, name: true, shortName: true, logoUrl: true } },
                },
                orderBy: { position: 'asc' },
              },
            },
          });

      if (!standing) {
        return reply.code(404).send({
          error: 'standings_not_ingested',
          message:
            'No standings snapshot in DB for this competition yet. Run football ingest with standings enabled.',
        });
      }

      return {
        source: 'db',
        competitionId: id,
        competitionName: competition.name,
        season: standing.season,
        lastSyncedAt: standing.lastSyncedAt.toISOString(),
        rows: standing.rows.map((r) => ({
          position: r.position,
          team: r.team,
          played: r.played,
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          goalDifference: r.goalDifference,
          points: r.points,
          form: r.form,
        })),
      };
    },
  );

  app.get(
    '/api/sources',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['sources'],
        security: [{ bearerAuth: [] }],
        summary: 'List connected external sources',
      },
    },
    async (req) => {
      const sources = await prisma.connectedSource.findMany({
        where: { userId: req.sessionUser!.id },
        orderBy: { createdAt: 'asc' },
      });
      return {
        sources: sources.map((s) => ({
          id: s.id,
          sourceType: s.sourceType,
          config: s.config,
          isActive: s.isActive,
          lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post(
    '/api/sources/google-calendar',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['sources'],
        security: [{ bearerAuth: [] }],
        summary: 'Google Calendar connect (deferred — requires OAuth client)',
      },
    },
    async (_req, reply) => {
      return reply.code(501).send({
        error: 'not_implemented',
        message:
          'Google Calendar sync ships in a later phase. Provide GOOGLE_CALENDAR_CLIENT_ID/SECRET when ready.',
      });
    },
  );

  app.delete(
    '/api/sources/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['sources'],
        security: [{ bearerAuth: [] }],
        summary: 'Disconnect a source',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = await prisma.connectedSource.findFirst({
        where: { id, userId: req.sessionUser!.id },
      });
      if (!row) return reply.code(404).send({ error: 'not_found' });
      await prisma.connectedSource.update({
        where: { id },
        data: { isActive: false },
      });
      return { ok: true };
    },
  );
}
