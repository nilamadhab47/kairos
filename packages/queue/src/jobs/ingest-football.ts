/**
 * Football ingest — reminder-first.
 *
 * Product goal: upcoming + today's fixtures for major leagues/cups so users
 * get "this match is today / coming up" reminders. Live scores are secondary.
 *
 * Strategy:
 *   1. ESPN monthly scoreboards for curated soccer leagues (EPL, La Liga, UCL,
 *      FA Cup, Copa del Rey, …) — free, no RapidAPI quota.
 *   2. Optional SportAPI7 full-season backfill when RapidAPI quota allows.
 *   3. Optional API-Football season/standings when the plan includes the season.
 *
 * Data rule: never fabricate fixtures.
 */

import { prisma } from '@kairo/db';
import {
  APIFootballProvider,
  ESPNProvider,
  ESPN_REMINDER_SOCCER_LEAGUES,
  findCompetitionIdByProvider,
  SportAPI7Provider,
  upsertMatches,
  upsertStandings,
} from '@kairo/sports';
import type { NormalizedMatch, UpsertBatchResult } from '@kairo/sports';
import { ingestUclCalendar, type IngestUclResult } from './ingest-ucl.js';

/** UEFA club competitions — need a longer window than domestic leagues. */
export const UEFA_ESPN_SLUGS = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'] as const;
export const UEFA_ESPN_MONTHS_AHEAD = 10;

/**
 * Curated leagues for optional SportAPI7 / API-Football deep season pulls.
 * Reminder fixtures come from ESPN_REMINDER_SOCCER_LEAGUES (broader cup set).
 */
export const CURATED_FOOTBALL_LEAGUES: Array<{
  id: number;
  name: string;
  tier: number;
  sportApi7TournamentId: number;
  sportApi7SeasonId?: number;
  sportApi7SeasonName?: string;
  espnSlug?: string;
}> = [
  {
    id: 39,
    name: 'Premier League',
    tier: 1,
    sportApi7TournamentId: 17,
    sportApi7SeasonId: 96668,
    sportApi7SeasonName: 'Premier League 26/27',
    espnSlug: 'eng.1',
  },
  { id: 140, name: 'La Liga', tier: 1, sportApi7TournamentId: 8, espnSlug: 'esp.1' },
  { id: 135, name: 'Serie A', tier: 1, sportApi7TournamentId: 23, espnSlug: 'ita.1' },
  { id: 78, name: 'Bundesliga', tier: 1, sportApi7TournamentId: 35, espnSlug: 'ger.1' },
  { id: 61, name: 'Ligue 1', tier: 1, sportApi7TournamentId: 34, espnSlug: 'fra.1' },
  { id: 2, name: 'UEFA Champions League', tier: 1, sportApi7TournamentId: 7, espnSlug: 'uefa.champions' },
  { id: 3, name: 'UEFA Europa League', tier: 2, sportApi7TournamentId: 679, espnSlug: 'uefa.europa' },
  { id: 253, name: 'Major League Soccer', tier: 2, sportApi7TournamentId: 242, espnSlug: 'usa.1' },
  { id: 88, name: 'Eredivisie', tier: 2, sportApi7TournamentId: 37 },
  { id: 71, name: 'Brasileirão', tier: 2, sportApi7TournamentId: 325 },
  { id: 323, name: 'Indian Super League', tier: 3, sportApi7TournamentId: 1900, espnSlug: 'ind.1' },
];

export function isFootballConfigured(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY?.trim());
}

export function isSportApi7Configured(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY?.trim());
}

export interface IngestFootballLeagueResult extends UpsertBatchResult {
  leagueId: number;
  leagueName: string;
  season: number | string;
  source: 'sportapi7' | 'api-football' | 'none';
  sportApi7TournamentId?: number;
  partial?: boolean;
  pagesFetched?: number;
}

export interface IngestFootballResult {
  season: number;
  /** ESPN reminder window (today + upcoming months). */
  fixtures: UpsertBatchResult & {
    provider: 'ESPN';
    months: string[];
    byLeague: Record<string, number>;
    upcoming: number;
    today: number;
  };
  leagues: IngestFootballLeagueResult[];
  standings: Array<{
    leagueId: number;
    leagueName: string;
    season: string;
    competitionId: string | null;
    rows: number;
    source?: string;
    error?: string;
  }>;
  providerErrors: Array<{ provider: string; message: string }>;
  /** Official UCL calendar (UEFA API + ESPN fallback). */
  ucl: IngestUclResult | null;
}

function currentFootballSeason(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function resolveDbCompetitionId(opts: {
  apiFootballLeagueId: number;
  sportApi7TournamentId: number;
  name: string;
  espnSlug?: string;
}): Promise<string | null> {
  const tries: Array<[string, string]> = [
    ['espn', opts.espnSlug ?? ''],
    ['sportapi7', String(opts.sportApi7TournamentId)],
    ['sportapi7', `tournament:${opts.sportApi7TournamentId}`],
    ['api-football', String(opts.apiFootballLeagueId)],
    ['api-football', `league:${opts.apiFootballLeagueId}`],
  ].filter(([, id]) => Boolean(id)) as Array<[string, string]>;

  for (const [provider, externalId] of tries) {
    const id = await findCompetitionIdByProvider(provider, externalId, 'football');
    if (id) return id;
  }
  const byName = await prisma.competition.findFirst({
    where: { sportId: 'football', name: opts.name },
  });
  return byName?.id ?? null;
}

/**
 * Ingest football fixtures for reminders.
 *
 * @param opts.monthsAhead ESPN months to pull (default 3 ⇒ this month + 3).
 * @param opts.deepSeason  Also attempt SportAPI7/API-Football full-season (default false —
 *                         RapidAPI monthly quota is limited; reminders don't need it).
 * @param opts.leagueIds   Restrict deep-season curated set (API-Football ids).
 * @param opts.espnSlugs   Restrict ESPN reminder leagues.
 */
export async function ingestFootballFixtures(opts?: {
  season?: number;
  leagueIds?: number[];
  monthsAhead?: number;
  deepSeason?: boolean;
  espnSlugs?: string[];
  /** Skip the official UCL pull (used by the validation harness). */
  skipUcl?: boolean;
}): Promise<IngestFootballResult> {
  const season = opts?.season ?? currentFootballSeason();
  const errors: Array<{ provider: string; message: string }> = [];
  const seasonHint = String(season);
  const monthsAhead = opts?.monthsAhead ?? 3;
  const deepSeason = opts?.deepSeason === true;

  // 1) ESPN reminder window — primary path for the product
  const espn = new ESPNProvider();
  let fixturesBatch: IngestFootballResult['fixtures'] = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    provider: 'ESPN',
    months: [],
    byLeague: {},
    upcoming: 0,
    today: 0,
  };

  try {
    const requested = opts?.espnSlugs ?? [...ESPN_REMINDER_SOCCER_LEAGUES];
    const uefaSet = new Set<string>(UEFA_ESPN_SLUGS);
    const split = opts?.espnSlugs == null;
    const domesticSlugs = split ? requested.filter((s) => !uefaSet.has(s)) : requested;
    const uefaSlugs = split ? requested.filter((s) => uefaSet.has(s)) : [];

    const windows: Array<Awaited<ReturnType<ESPNProvider['fetchSoccerFixtureWindow']>>> = [];
    if (domesticSlugs.length > 0) {
      windows.push(
        await espn.fetchSoccerFixtureWindow({
          monthsAhead,
          leagueSlugs: domesticSlugs,
        }),
      );
    }
    if (uefaSlugs.length > 0) {
      windows.push(
        await espn.fetchSoccerFixtureWindow({
          monthsAhead: Math.max(monthsAhead, UEFA_ESPN_MONTHS_AHEAD),
          leagueSlugs: uefaSlugs,
        }),
      );
    }

    const seen = new Set<string>();
    const mergedMatches: NormalizedMatch[] = [];
    const months = new Set<string>();
    const byLeague: Record<string, number> = {};
    for (const window of windows) {
      for (const m of window.matches) {
        if (seen.has(m.providerRef.externalId)) continue;
        seen.add(m.providerRef.externalId);
        mergedMatches.push(m);
      }
      for (const ym of window.months) months.add(ym);
      for (const [k, v] of Object.entries(window.byLeague)) {
        byLeague[k] = (byLeague[k] ?? 0) + v;
      }
      for (const e of window.errors) {
        errors.push({
          provider: `espn:${e.league}:${e.month}`,
          message: e.message,
        });
      }
    }

    const batch = await upsertMatches(mergedMatches);
    const dayStart = startOfUtcDay();
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const today = mergedMatches.filter((m) => m.startsAt >= dayStart && m.startsAt < dayEnd).length;
    const upcoming = mergedMatches.filter((m) => m.startsAt >= dayEnd).length;

    fixturesBatch = {
      ...batch,
      provider: 'ESPN',
      months: [...months].sort(),
      byLeague,
      upcoming,
      today,
    };
  } catch (err) {
    errors.push({
      provider: 'espn:fixtures',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  let ucl: IngestUclResult | null = null;
  if (!opts?.skipUcl) {
    try {
      ucl = await ingestUclCalendar();
      errors.push(...ucl.providerErrors);
    } catch (err) {
      errors.push({
        provider: 'uefa:ucl',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const leagues: IngestFootballLeagueResult[] = [];
  const standingsResults: IngestFootballResult['standings'] = [];

  if (!deepSeason) {
    return {
      season,
      fixtures: fixturesBatch,
      leagues,
      standings: standingsResults,
      providerErrors: errors,
      ucl,
    };
  }

  // 2) Optional deep season (SportAPI7 → API-Football) — skipped by default
  const selected =
    opts?.leagueIds != null
      ? CURATED_FOOTBALL_LEAGUES.filter((l) => opts.leagueIds!.includes(l.id))
      : CURATED_FOOTBALL_LEAGUES;

  const sa7 = isSportApi7Configured() ? new SportAPI7Provider() : null;
  const apiFootball = isFootballConfigured() ? new APIFootballProvider() : null;

  for (const meta of selected) {
    let ingested = false;

    if (sa7) {
      try {
        const { matches, seasonName, partial, pagesFetched } = await sa7.fetchTournamentSeason(
          meta.sportApi7TournamentId,
          {
            seasonHint,
            sport: 'football',
            seasonId: meta.sportApi7SeasonId,
            seasonName: meta.sportApi7SeasonName,
          },
        );
        if (matches.length > 0) {
          const batch = await upsertMatches(matches);
          leagues.push({
            ...batch,
            leagueId: meta.id,
            leagueName: meta.name,
            season: seasonName,
            source: 'sportapi7',
            sportApi7TournamentId: meta.sportApi7TournamentId,
            partial,
            pagesFetched,
          });
          ingested = true;
          if (partial) {
            errors.push({
              provider: `sportapi7:tournament:${meta.sportApi7TournamentId}`,
              message: `partial season ingest (${matches.length} matches, ${pagesFetched} pages)`,
            });
          }
        }
      } catch (err) {
        errors.push({
          provider: `sportapi7:tournament:${meta.sportApi7TournamentId}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      await new Promise((r) => setTimeout(r, 8_000));
    }

    if (!ingested && apiFootball) {
      try {
        const matches = await apiFootball.fetchLeagueSeason(meta.id, season);
        const batch = await upsertMatches(matches);
        leagues.push({
          ...batch,
          leagueId: meta.id,
          leagueName: meta.name,
          season,
          source: 'api-football',
        });
        ingested = true;
      } catch (err) {
        errors.push({
          provider: `api-football:league:${meta.id}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!ingested) {
      leagues.push({
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{ message: 'deep season unavailable (quota/plan)' }],
        leagueId: meta.id,
        leagueName: meta.name,
        season,
        source: 'none',
        sportApi7TournamentId: meta.sportApi7TournamentId,
      });
    }
  }

  // 3) Optional standings (best-effort)
  for (const meta of selected) {
    if (sa7) {
      try {
        const snapshot = await sa7.fetchStandings({
          sport: 'football',
          competitionId: `sportapi7:tournament:${meta.sportApi7TournamentId}`,
          season: seasonHint,
        });
        if (snapshot) {
          const competitionId = await resolveDbCompetitionId({
            apiFootballLeagueId: meta.id,
            sportApi7TournamentId: meta.sportApi7TournamentId,
            name: meta.name,
            espnSlug: meta.espnSlug,
          });
          if (competitionId) {
            const { rows } = await upsertStandings(competitionId, snapshot.season, snapshot);
            standingsResults.push({
              leagueId: meta.id,
              leagueName: meta.name,
              season: snapshot.season,
              competitionId,
              rows,
              source: 'sportapi7',
            });
            continue;
          }
        }
      } catch (err) {
        errors.push({
          provider: `sportapi7:standings:${meta.sportApi7TournamentId}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    season,
    fixtures: fixturesBatch,
    leagues,
    standings: standingsResults,
    providerErrors: errors,
    ucl,
  };
}

export async function searchFootballTeams(query: string): Promise<
  Array<{ id: string; name: string; country?: string; logo?: string; provider: string }>
> {
  const espn = new ESPNProvider();
  const teams = await espn.fetchTeams({ sport: 'football', query });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    country: t.country,
    logo: t.logoUrl,
    provider: 'ESPN',
  }));
}
