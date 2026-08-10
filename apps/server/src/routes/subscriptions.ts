import type { FastifyInstance } from 'fastify';
import { Prisma, prisma } from '@kairo/db';
import { canonicalizeCompetitionIds } from '../lib/competitions.js';

export async function registerSubscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/subscriptions/summary',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        summary:
          'Aggregated summary: counts by sport and by entityType, plus the hydrated entities themselves for a Settings/Review UI.',
      },
    },
    async (req) => {
      const userId = req.sessionUser!.id;
      const subs = await prisma.userSubscription.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      // Hydrate competition + team names/logos in exactly 2 batched queries,
      // regardless of how many subscriptions the user has.
      const compIds = subs
        .filter((s) => s.entityType === 'competition')
        .map((s) => s.entityId);
      const teamIds = subs
        .filter((s) => s.entityType === 'team')
        .map((s) => s.entityId);

      const [comps, teams] = await Promise.all([
        compIds.length
          ? prisma.competition.findMany({
              where: { id: { in: compIds } },
              select: {
                id: true,
                sportId: true,
                displayName: true,
                name: true,
                logoUrl: true,
                country: true,
                format: true,
                gender: true,
              },
            })
          : Promise.resolve([]),
        teamIds.length
          ? prisma.team.findMany({
              where: { id: { in: teamIds } },
              select: {
                id: true,
                sportId: true,
                name: true,
                shortName: true,
                type: true,
                country: true,
                logoUrl: true,
              },
            })
          : Promise.resolve([]),
      ]);
      const compById = new Map(comps.map((c) => [c.id, c]));
      const teamById = new Map(teams.map((t) => [t.id, t]));

      // Look up sport labels once so the response can drive rendering directly.
      // (Sport.id IS the category key used on UserSubscription.category.)
      const sportRows = await prisma.sport.findMany({
        select: { id: true, name: true, sortOrder: true },
      });
      const sportInfo = new Map(sportRows.map((s) => [s.id, s]));

      type SummaryEntity = {
        id: string;
        name: string | null;
        displayName?: string | null;
        logoUrl: string | null;
      };
      type SummaryTotals = { category: number; competition: number; team: number; player: number };
      type SummarySport = {
        sportId: string;
        sportLabel: string;
        sortOrder: number;
        totals: SummaryTotals;
        followsWholeSport: boolean;
        competitions: SummaryEntity[];
        teams: SummaryEntity[];
      };

      const bySport = new Map<string, SummarySport>();
      const ensure = (sportId: string): SummarySport => {
        let g = bySport.get(sportId);
        if (!g) {
          const info = sportInfo.get(sportId);
          g = {
            sportId,
            sportLabel: info?.name ?? sportId,
            sortOrder: info?.sortOrder ?? 999,
            totals: { category: 0, competition: 0, team: 0, player: 0 },
            followsWholeSport: false,
            competitions: [],
            teams: [],
          };
          bySport.set(sportId, g);
        }
        return g;
      };

      for (const s of subs) {
        const g = ensure(s.category);
        if (s.entityType === 'competition') {
          g.totals.competition += 1;
          const c = compById.get(s.entityId);
          g.competitions.push({
            id: s.entityId,
            name: c?.name ?? s.entityName,
            displayName: c?.displayName ?? s.entityName,
            logoUrl: c?.logoUrl ?? null,
          });
        } else if (s.entityType === 'team') {
          g.totals.team += 1;
          const t = teamById.get(s.entityId);
          g.teams.push({
            id: s.entityId,
            name: t?.name ?? s.entityName,
            displayName: null,
            logoUrl: t?.logoUrl ?? null,
          });
        } else if (s.entityType === 'player') {
          g.totals.player += 1;
        } else if (s.entityType === 'category' || s.entityId === s.category) {
          g.totals.category += 1;
          g.followsWholeSport = true;
        }
      }

      const sports = [...bySport.values()].sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        totalSubscriptions: subs.length,
        sports,
        source: 'db',
      };
    },
  );

  app.get(
    '/api/subscriptions',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        summary: 'List sport / entity subscriptions',
      },
    },
    async (req) => {
      const rows = await prisma.userSubscription.findMany({
        where: { userId: req.sessionUser!.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      return { subscriptions: rows };
    },
  );

  app.put(
    '/api/subscriptions',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        summary: 'Replace active subscriptions (idempotent upsert + deactivate missing)',
        body: {
          type: 'object',
          required: ['subscriptions'],
          properties: {
            subscriptions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['category', 'entityType', 'entityId', 'entityName'],
                properties: {
                  category: { type: 'string' },
                  entityType: { type: 'string' },
                  entityId: { type: 'string' },
                  entityName: { type: 'string' },
                  entityMeta: {},
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.sessionUser!.id;
      const body = req.body as {
        subscriptions: Array<{
          category: string;
          entityType: string;
          entityId: string;
          entityName: string;
          entityMeta?: unknown;
        }>;
      };

      // Collapse season/provider clones onto the canonical competition id so
      // users never save a stale La Liga row with 2 teams / 0 matches.
      const rawCompIds = body.subscriptions
        .filter((s) => s.entityType === 'competition' && s.entityId !== s.category)
        .map((s) => s.entityId);
      if (rawCompIds.length > 0) {
        const canonical = await canonicalizeCompetitionIds(rawCompIds);
        const deduped: typeof body.subscriptions = [];
        const seen = new Set<string>();
        for (const s of body.subscriptions) {
          if (s.entityType === 'competition' && s.entityId !== s.category) {
            const nextId = canonical.get(s.entityId) ?? s.entityId;
            const key = `${s.category}::${nextId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push({ ...s, entityId: nextId });
          } else {
            const key = `${s.category}::${s.entityType}::${s.entityId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(s);
          }
        }
        body.subscriptions = deduped;
      }

      // Batch-validate: 3 grouped queries regardless of how many subscriptions
      // land in the payload. Keeps a big Sport→Comp→Team→Review save fast.
      const sportIds = [...new Set(body.subscriptions.map((s) => s.category))];
      const compIds = body.subscriptions
        .filter((s) => s.entityType === 'competition' && s.entityId !== s.category)
        .map((s) => s.entityId);
      const teamIds = body.subscriptions
        .filter((s) => s.entityType === 'team' && s.entityId !== s.category)
        .map((s) => s.entityId);
      const playerIds = body.subscriptions
        .filter(
          (s) =>
            (s.entityType === 'player' || s.entityType === 'driver') &&
            s.entityId !== s.category,
        )
        .map((s) => s.entityId);

      const [knownSports, knownComps, knownTeams, knownPlayers] = await Promise.all([
        prisma.sport.findMany({ where: { id: { in: sportIds } }, select: { id: true } }),
        compIds.length
          ? prisma.competition.findMany({
              where: { id: { in: compIds } },
              select: { id: true, sportId: true },
            })
          : Promise.resolve([]),
        teamIds.length
          ? prisma.team.findMany({
              where: { id: { in: teamIds } },
              select: { id: true, sportId: true },
            })
          : Promise.resolve([]),
        playerIds.length
          ? prisma.player.findMany({
              where: { id: { in: playerIds } },
              select: { id: true, sportId: true },
            })
          : Promise.resolve([]),
      ]);
      const sportSet = new Set(knownSports.map((s) => s.id));
      const compKey = new Set(knownComps.map((c) => `${c.sportId}::${c.id}`));
      const teamKey = new Set(knownTeams.map((t) => `${t.sportId}::${t.id}`));
      const playerKey = new Set(knownPlayers.map((p) => `${p.sportId}::${p.id}`));

      for (const s of body.subscriptions) {
        if (!sportSet.has(s.category)) {
          return reply.code(400).send({ error: 'unknown_sport', category: s.category });
        }
        if (s.entityType === 'category' || s.entityId === s.category) continue;
        const key = `${s.category}::${s.entityId}`;
        if (s.entityType === 'competition' && !compKey.has(key)) {
          return reply.code(400).send({
            error: 'unknown_competition',
            entityId: s.entityId,
            message: 'Competition must exist in ingested catalog',
          });
        }
        if (s.entityType === 'team' && !teamKey.has(key)) {
          return reply.code(400).send({
            error: 'unknown_team',
            entityId: s.entityId,
            message: 'Team must exist in ingested catalog',
          });
        }
        if ((s.entityType === 'player' || s.entityType === 'driver') && !playerKey.has(key)) {
          return reply.code(400).send({
            error: 'unknown_player',
            entityId: s.entityId,
            message: 'Player/driver must exist in ingested catalog',
          });
        }
      }

      const keepKeys = new Set(
        body.subscriptions.map((s) => `${s.category}::${s.entityId}`),
      );

      for (const s of body.subscriptions) {
        await prisma.userSubscription.upsert({
          where: {
            userId_category_entityId: {
              userId,
              category: s.category,
              entityId: s.entityId,
            },
          },
          create: {
            userId,
            category: s.category,
            entityType: s.entityType,
            entityId: s.entityId,
            entityName: s.entityName,
            entityMeta: (s.entityMeta as Prisma.InputJsonValue | undefined) ?? undefined,
            isActive: true,
          },
          update: {
            entityType: s.entityType,
            entityName: s.entityName,
            entityMeta: (s.entityMeta as Prisma.InputJsonValue | undefined) ?? undefined,
            isActive: true,
          },
        });
      }

      const existing = await prisma.userSubscription.findMany({ where: { userId } });
      for (const row of existing) {
        const key = `${row.category}::${row.entityId}`;
        if (!keepKeys.has(key) && row.isActive) {
          await prisma.userSubscription.update({
            where: { id: row.id },
            data: { isActive: false },
          });
        }
      }

      const subscriptions = await prisma.userSubscription.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      return { subscriptions };
    },
  );

  app.delete(
    '/api/subscriptions/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        summary: 'Deactivate a subscription',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = await prisma.userSubscription.findFirst({
        where: { id, userId: req.sessionUser!.id },
      });
      if (!row) return reply.code(404).send({ error: 'not_found' });
      await prisma.userSubscription.update({
        where: { id },
        data: { isActive: false },
      });
      return { ok: true };
    },
  );
}
