/**
 * Persist goals / cards / substitutions for recently completed football matches.
 *
 * Sources (real provider JSON only — never invented):
 *   1. ESPN soccer summary `keyEvents` when the match has an ESPN ref.
 *   2. UEFA `playerEvents` when the match has a UEFA ref (UCL qualifying, etc.).
 *
 * Cadence: repeatable ~30m plus a kick after football/UCL ingest.
 */

import { prisma } from '@kairo/db';
import {
  ESPNProvider,
  UEFAProvider,
  replaceMatchEvents,
} from '@kairo/sports';

export type EnrichMatchEventsJobData = {
  /** Max matches to attempt this run (default 25). */
  limit?: number;
  /** Look back this many days (default 10). */
  days?: number;
};

export type EnrichMatchEventsResult = {
  attempted: number;
  updated: number;
  empty: number;
  skipped: number;
  errors: string[];
  bySource: Record<string, number>;
};

type Ref = { provider?: string; externalId?: string };

function asRefs(value: unknown): Ref[] {
  return Array.isArray(value) ? (value as Ref[]) : [];
}

function refId(refs: Ref[], provider: string): string | undefined {
  const p = provider.toLowerCase();
  const hit = refs.find((r) => String(r.provider ?? '').toLowerCase() === p);
  return hit?.externalId ? String(hit.externalId) : undefined;
}

function espnLeagueSlug(competitionRefs: Ref[]): string | undefined {
  const raw = refId(competitionRefs, 'espn');
  if (!raw) return undefined;
  const slug = raw.includes('/') ? raw.split('/').pop() : raw;
  return slug || undefined;
}

function stampMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): object {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

export async function enrichMatchEvents(
  data: EnrichMatchEventsJobData = {},
): Promise<EnrichMatchEventsResult> {
  const limit = Math.min(80, Math.max(1, data.limit ?? 25));
  const days = Math.min(30, Math.max(1, data.days ?? 10));
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60_000);
  const finishedBefore = new Date(now.getTime() - 3 * 60_000);

  const result: EnrichMatchEventsResult = {
    attempted: 0,
    updated: 0,
    empty: 0,
    skipped: 0,
    errors: [],
    bySource: {},
  };

  const rows = await prisma.match.findMany({
    where: {
      sportId: 'football',
      status: { in: ['completed', 'finished'] },
      startsAt: { gte: since, lte: finishedBefore },
    },
    include: {
      competition: { select: { providerRefs: true } },
      homeTeam: { select: { providerRefs: true } },
      awayTeam: { select: { providerRefs: true } },
      matchEvents: { select: { id: true }, take: 1 },
    },
    orderBy: { startsAt: 'desc' },
    take: limit * 3,
  });

  const pending = rows.filter((m) => {
    if (m.matchEvents.length > 0) return false;
    const meta = m.metadata as { eventsEnrichedAt?: unknown } | null;
    if (meta && typeof meta === 'object' && meta.eventsEnrichedAt) return false;
    return true;
  }).slice(0, limit);

  if (pending.length === 0) return result;

  const espn = new ESPNProvider();
  const uefa = new UEFAProvider();

  for (const match of pending) {
    result.attempted += 1;
    const matchRefs = asRefs(match.providerRefs);
    const espnMatchId = refId(matchRefs, 'espn');
    const uefaMatchId = refId(matchRefs, 'uefa');
    const leagueSlug = espnLeagueSlug(asRefs(match.competition.providerRefs));
    const homeEspn = refId(asRefs(match.homeTeam?.providerRefs), 'espn');
    const awayEspn = refId(asRefs(match.awayTeam?.providerRefs), 'espn');
    const homeUefa = refId(asRefs(match.homeTeam?.providerRefs), 'uefa');
    const awayUefa = refId(asRefs(match.awayTeam?.providerRefs), 'uefa');

    try {
      let source: 'espn' | 'uefa' | null = null;
      let events =
        espnMatchId
          ? await espn.fetchMatchEvents(`espn:${espnMatchId}`, {
              leagueSlug,
              homeTeamExternalId: homeEspn,
              awayTeamExternalId: awayEspn,
            })
          : [];
      if (events.length > 0) source = 'espn';

      if (events.length === 0 && uefaMatchId) {
        events = await uefa.fetchMatchEvents(`uefa:${uefaMatchId}`, {
          homeTeamExternalId: homeUefa,
          awayTeamExternalId: awayUefa,
        });
        if (events.length > 0) source = 'uefa';
      }

      const written = await replaceMatchEvents(match.id, events);
      await prisma.match.update({
        where: { id: match.id },
        data: {
          metadata: stampMetadata(match.metadata, {
            eventsEnrichedAt: now.toISOString(),
            eventsEnrichSource: source,
            eventsEnrichCount: written,
          }) as object,
        },
      });

      if (written > 0) {
        result.updated += 1;
        result.bySource[source ?? 'unknown'] = (result.bySource[source ?? 'unknown'] ?? 0) + 1;
      } else {
        result.empty += 1;
      }
    } catch (err) {
      result.errors.push(
        `${match.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  result.skipped = rows.length - pending.length;
  return result;
}
