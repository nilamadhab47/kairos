/**
 * Public Match-backed browse APIs — real ingested data only (no mocks).
 * Personalized filtering lives on /api/me/feed and /api/events/*.
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';

function serializeMatch(m: {
  id: string;
  sportId: string;
  competitionId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: string | null;
  metadata: unknown;
  providerRefs: unknown;
  lastSyncedAt: Date;
  competition?: { id: string; name: string; country: string | null; logoUrl: string | null; season: string | null } | null;
  homeTeam?: { id: string; name: string; shortName: string | null; logoUrl: string | null } | null;
  awayTeam?: { id: string; name: string; shortName: string | null; logoUrl: string | null } | null;
}) {
  const refs = Array.isArray(m.providerRefs) ? m.providerRefs : [];
  const primary = refs[0] as { provider?: string; externalId?: string } | undefined;
  return {
    id: m.id,
    sportId: m.sportId,
    competitionId: m.competitionId,
    competition: m.competition
      ? {
          id: m.competition.id,
          name: m.competition.name,
          country: m.competition.country,
          logoUrl: m.competition.logoUrl,
          season: m.competition.season,
        }
      : null,
    homeTeam: m.homeTeam
      ? {
          id: m.homeTeam.id,
          name: m.homeTeam.name,
          shortName: m.homeTeam.shortName,
          logoUrl: m.homeTeam.logoUrl,
        }
      : null,
    awayTeam: m.awayTeam
      ? {
          id: m.awayTeam.id,
          name: m.awayTeam.name,
          shortName: m.awayTeam.shortName,
          logoUrl: m.awayTeam.logoUrl,
        }
      : null,
    startsAt: m.startsAt.toISOString(),
    status: m.status,
    score: { home: m.homeScore, away: m.awayScore },
    venue: m.venue,
    round: m.round,
    metadata: m.metadata,
    provenance: {
      providerRefs: refs,
      primaryProvider: primary?.provider ?? null,
      lastSyncedAt: m.lastSyncedAt.toISOString(),
    },
  };
}

const matchInclude = {
  competition: {
    select: { id: true, name: true, country: true, logoUrl: true, season: true },
  },
  homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
  awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
} as const;

export async function registerMatchRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/matches/upcoming',
    {
      schema: {
        tags: ['matches'],
        summary: 'Upcoming matches from ingested Match table (real data only)',
        querystring: {
          type: 'object',
          properties: {
            sport: { type: 'string' },
            competitionId: { type: 'string' },
            teamId: { type: 'string' },
            days: { type: 'integer', minimum: 1, maximum: 60, default: 14 },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (req) => {
      const q = req.query as {
        sport?: string;
        competitionId?: string;
        teamId?: string;
        days?: number;
        limit?: number;
      };
      const days = q.days ?? 14;
      const limit = q.limit ?? 50;
      const now = new Date();
      const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const matches = await prisma.match.findMany({
        where: {
          startsAt: { gte: now, lt: until },
          status: { notIn: ['cancelled'] },
          ...(q.sport ? { sportId: q.sport } : {}),
          ...(q.competitionId ? { competitionId: q.competitionId } : {}),
          ...(q.teamId
            ? { OR: [{ homeTeamId: q.teamId }, { awayTeamId: q.teamId }] }
            : {}),
        },
        include: matchInclude,
        orderBy: { startsAt: 'asc' },
        take: limit,
      });

      return {
        source: 'db',
        from: now.toISOString(),
        until: until.toISOString(),
        count: matches.length,
        matches: matches.map(serializeMatch),
      };
    },
  );

  app.get(
    '/api/matches',
    {
      schema: {
        tags: ['matches'],
        summary: 'Browse matches by sport / date window (ingested Match rows only)',
        querystring: {
          type: 'object',
          properties: {
            sport: { type: 'string' },
            competitionId: { type: 'string' },
            teamId: { type: 'string' },
            status: { type: 'string' },
            from: { type: 'string', description: 'ISO date/datetime' },
            to: { type: 'string', description: 'ISO date/datetime' },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (req, reply) => {
      const q = req.query as {
        sport?: string;
        competitionId?: string;
        teamId?: string;
        status?: string;
        from?: string;
        to?: string;
        limit?: number;
      };

      if (!q.sport && !q.competitionId && !q.teamId) {
        return reply.code(400).send({
          error: 'missing_filter',
          message: 'Provide at least one of sport, competitionId, or teamId',
        });
      }

      const from = q.from ? new Date(q.from) : undefined;
      const to = q.to ? new Date(q.to) : undefined;
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        return reply.code(400).send({ error: 'invalid_date' });
      }

      const matches = await prisma.match.findMany({
        where: {
          ...(q.sport ? { sportId: q.sport } : {}),
          ...(q.competitionId ? { competitionId: q.competitionId } : {}),
          ...(q.teamId
            ? { OR: [{ homeTeamId: q.teamId }, { awayTeamId: q.teamId }] }
            : {}),
          ...(q.status ? { status: q.status } : {}),
          ...(from || to
            ? {
                startsAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lt: to } : {}),
                },
              }
            : {}),
        },
        include: matchInclude,
        orderBy: { startsAt: 'asc' },
        take: q.limit ?? 50,
      });

      return {
        source: 'db',
        count: matches.length,
        matches: matches.map(serializeMatch),
      };
    },
  );

  app.get(
    '/api/matches/live',
    {
      schema: {
        tags: ['matches'],
        summary: 'Currently live matches from DB',
        querystring: {
          type: 'object',
          properties: {
            sport: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { sport } = req.query as { sport?: string };
      const matches = await prisma.match.findMany({
        where: {
          status: 'live',
          ...(sport ? { sportId: sport } : {}),
        },
        include: matchInclude,
        orderBy: { startsAt: 'asc' },
        take: 100,
      });
      return { source: 'db', count: matches.length, matches: matches.map(serializeMatch) };
    },
  );

  app.get(
    '/api/matches/:id',
    {
      schema: {
        tags: ['matches'],
        summary: 'Match detail with provenance',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const match = await prisma.match.findUnique({
        where: { id },
        include: matchInclude,
      });
      if (!match) return reply.code(404).send({ error: 'not_found' });
      return { source: 'db', match: serializeMatch(match) };
    },
  );
}
