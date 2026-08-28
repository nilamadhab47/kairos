/**
 * UEFA Champions League calendar ingest.
 *
 * Primary: official match.uefa.com/v5 (same feed UEFA.com uses).
 * Fallback: ESPN monthly scoreboard for `uefa.champions` over the rest of
 * the season — used only when UEFA has no upcoming league-phase / knockout
 * fixtures yet (typical in the 48h between the draw and the kickoff drop).
 *
 * Data rule: never invent fixtures. Empty UEFA + empty ESPN = empty result.
 */

import {
  ESPNProvider,
  UEFAProvider,
  UEFA_COMPETITIONS,
  uefaSeasonLabel,
  uefaSeasonYear,
  upsertMatches,
} from '@kairo/sports';
import type { NormalizedMatch, UpsertBatchResult } from '@kairo/sports';

/** Cover league phase (Sep–Jan) through the June final. */
export const UCL_ESPN_MONTHS_AHEAD = 10;

export interface IngestUclResult {
  seasonYear: number;
  seasonLabel: string;
  uefa: UpsertBatchResult & {
    fetched: number;
    skippedPlaceholder: number;
    skippedNoKickoff: number;
    skippedUnnamed: number;
    byPhase: Record<string, number>;
    upcoming: number;
  };
  espnFallback: (UpsertBatchResult & {
    used: boolean;
    months: string[];
    fetched: number;
    upcoming: number;
  }) | null;
  providerErrors: Array<{ provider: string; message: string }>;
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function ingestUclCalendar(opts?: {
  seasonYear?: number;
  /** Force ESPN even if UEFA already has upcoming tournament fixtures. */
  espnAlways?: boolean;
}): Promise<IngestUclResult> {
  const seasonYear = opts?.seasonYear ?? uefaSeasonYear();
  const seasonLabel = uefaSeasonLabel(seasonYear);
  const errors: Array<{ provider: string; message: string }> = [];
  const uefa = new UEFAProvider();

  let uefaFetched = {
    matches: [] as NormalizedMatch[],
    fetched: 0,
    skippedPlaceholder: 0,
    skippedNoKickoff: 0,
    skippedUnnamed: 0,
    byPhase: {} as Record<string, number>,
    upcoming: 0,
  };

  try {
    uefaFetched = await uefa.fetchCompetitionSeason('ucl', seasonYear);
  } catch (err) {
    errors.push({
      provider: 'uefa:ucl',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const uefaBatch =
    uefaFetched.matches.length > 0
      ? await upsertMatches(uefaFetched.matches)
      : { processed: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  const tournamentUpcoming = uefaFetched.matches.filter((m) => {
    const phase = String(m.metadata?.phase ?? '').toUpperCase();
    const isTournament = phase === 'TOURNAMENT' || phase === 'LEAGUE' || phase === 'FINAL';
    return isTournament && m.startsAt.getTime() >= Date.now() && m.status !== 'completed';
  }).length;

  const needEspn = opts?.espnAlways === true || tournamentUpcoming === 0;
  let espnFallback: IngestUclResult['espnFallback'] = null;

  if (needEspn) {
    try {
      const espn = new ESPNProvider();
      const window = await espn.fetchSoccerFixtureWindow({
        monthsAhead: UCL_ESPN_MONTHS_AHEAD,
        leagueSlugs: [UEFA_COMPETITIONS.ucl.espnSlug],
      });
      const batch = window.matches.length > 0 ? await upsertMatches(window.matches) : {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      };
      const dayStart = startOfUtcDay();
      espnFallback = {
        ...batch,
        used: true,
        months: window.months,
        fetched: window.matches.length,
        upcoming: window.matches.filter((m) => m.startsAt >= dayStart).length,
      };
      for (const e of window.errors) {
        errors.push({
          provider: `espn:${e.league}:${e.month}`,
          message: e.message,
        });
      }
    } catch (err) {
      errors.push({
        provider: 'espn:uefa.champions',
        message: err instanceof Error ? err.message : String(err),
      });
      espnFallback = {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        used: true,
        months: [],
        fetched: 0,
        upcoming: 0,
      };
    }
  }

  return {
    seasonYear,
    seasonLabel,
    uefa: {
      ...uefaBatch,
      fetched: uefaFetched.fetched,
      skippedPlaceholder: uefaFetched.skippedPlaceholder,
      skippedNoKickoff: uefaFetched.skippedNoKickoff,
      skippedUnnamed: uefaFetched.skippedUnnamed,
      byPhase: uefaFetched.byPhase,
      upcoming: uefaFetched.upcoming,
    },
    espnFallback,
    providerErrors: errors,
  };
}
