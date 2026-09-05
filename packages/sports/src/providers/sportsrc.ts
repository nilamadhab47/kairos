/**
 * Sportsrc adapter — free, no-key JSON API mirroring football-data.org's
 * schema. The one gap-filler we needed: authoritative standings + finished
 * results for every major European league without a RapidAPI quota.
 *
 * Hosts (all public, no auth):
 *   - api.sportsrc.org/?data=results&category=tables&league=<CODE>
 *       Full 20/18/36-team standings with points, W/D/L, GF, GA, GD.
 *   - api.sportsrc.org/?data=results&category=scores&league=<CODE>
 *       Finished + live matches with fullTime/halfTime scores, referees.
 *
 * League codes (football-data.org compatible):
 *   PL=Premier League, PD=La Liga, SA=Serie A, BL1=Bundesliga,
 *   FL1=Ligue 1, CL=Champions League, PPL=Primeira Liga, DED=Eredivisie
 *
 * Rate limit: undocumented; we self-throttle to 1 req/s.
 *
 * Discovered from: https://github.com/dominberbel98/domingoberbel.com
 * (scripts/pipeline_laliga.py — his portfolio's La Liga analytics pipeline).
 */

import type {
  SportsProvider,
  SportsProviderConfig,
  FetchMatchesOpts,
  FetchStandingsOpts,
} from '../provider.js';
import type {
  NormalizedMatch,
  NormalizedStandings,
  NormalizedStandingRow,
  MatchStatus,
} from '../types.js';
import { providerFetchJson, setRateLimit } from '../http.js';

/* ── Constants ─────────────────────────────────────────────────────────── */

const BASE = 'https://api.sportsrc.org/';
const PROVIDER = 'sportsrc';

setRateLimit('api.sportsrc.org', { requests: 1, intervalMs: 1000 });

/**
 * Football-data.org league codes supported by sportsrc.
 * Kept as a public export so the ingest job can iterate.
 */
export const SPORTSRC_LEAGUES = {
  PL: 'Premier League',
  PD: 'La Liga',
  SA: 'Serie A',
  BL1: 'Bundesliga',
  FL1: 'Ligue 1',
  CL: 'UEFA Champions League',
  PPL: 'Primeira Liga',
  DED: 'Eredivisie',
} as const;

export type SportsrcLeagueCode = keyof typeof SPORTSRC_LEAGUES;

/* ── Raw response types (only the fields we consume) ───────────────────── */

interface SrcTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

interface SrcCompetition {
  id: number;
  name: string;
  code: string;
  type: 'LEAGUE' | 'CUP';
  emblem: string;
}

interface SrcSeason {
  id: number;
  startDate: string;
  endDate: string;
  currentMatchday: number;
  winner: unknown;
}

interface SrcStandingRow {
  position: number;
  team: SrcTeam;
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

interface SrcStandingsResponse {
  success: boolean;
  data: {
    filters: { season: string };
    area: { id: number; name: string; code: string };
    competition: SrcCompetition;
    season: SrcSeason;
    standings: Array<{
      stage: string;
      type: string;
      group: string;
      table: SrcStandingRow[];
    }>;
    last_updated: string;
  };
}

interface SrcMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  competition: SrcCompetition;
  season: SrcSeason;
  homeTeam: SrcTeam;
  awayTeam: SrcTeam;
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    duration: string;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  referees: Array<{ id: number; name: string; nationality: string }>;
}

interface SrcScoresResponse {
  success: boolean;
  data: {
    live: SrcMatch[];
    finished: SrcMatch[];
    last_updated: string;
  };
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function mapStatus(raw: string): MatchStatus {
  switch (raw.toUpperCase()) {
    case 'FINISHED':
      return 'completed';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    case 'POSTPONED':
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'postponed';
    default:
      return 'scheduled';
  }
}

function seasonLabel(season: SrcSeason): string {
  const start = season.startDate?.slice(0, 4);
  const end = season.endDate?.slice(2, 4);
  return start && end ? `${start}/${end}` : (start ?? String(new Date().getUTCFullYear()));
}

/* ── Provider ──────────────────────────────────────────────────────────── */

export class SportsrcProvider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: PROVIDER,
    // Priority 6 — above ESPN (10) for standings, below FPL (5) so FPL wins
    // for Premier League fixtures where it's the authoritative source.
    priority: 6,
    sports: ['football'],
  };

  async healthCheck(): Promise<boolean> {
    try {
      const res = await providerFetchJson<SrcStandingsResponse>({
        provider: PROVIDER,
        url: `${BASE}?data=results&category=tables&league=PL`,
      });
      return res.success === true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch finished + live matches for a league. Sportsrc doesn't expose a
   * general date-based fixture feed with proper competition tags, so this
   * only surfaces recent results (typically last ~2 gameweeks) — perfect for
   * back-filling scores after a match, but ESPN remains the source for
   * upcoming fixtures.
   *
   * `opts.competitionId` must be a league code from SPORTSRC_LEAGUES; without
   * one we default to Premier League so callers can't accidentally get a
   * cross-league dump.
   */
  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    if (opts.sport !== 'football') return [];
    const league = this.resolveLeague(opts.competitionId);
    if (!league) return [];

    const res = await providerFetchJson<SrcScoresResponse>({
      provider: PROVIDER,
      url: `${BASE}?data=results&category=scores&league=${league}`,
    });
    if (!res.success) return [];

    const combined = [...(res.data.live ?? []), ...(res.data.finished ?? [])];
    const dateFilter = opts.date; // YYYY-MM-DD
    const liveOnly = opts.live === true;

    return combined
      .filter((m) => {
        if (liveOnly && mapStatus(m.status) !== 'live') return false;
        if (dateFilter && m.utcDate.slice(0, 10) !== dateFilter) return false;
        return true;
      })
      .map((m) => this.normalizeMatch(m));
  }

  /**
   * League standings for a competition. Pass one of the SPORTSRC_LEAGUES
   * codes as `competitionId`.
   */
  async fetchStandings(opts: FetchStandingsOpts): Promise<NormalizedStandings | null> {
    if (opts.sport !== 'football') return null;
    const league = this.resolveLeague(opts.competitionId);
    if (!league) return null;

    const res = await providerFetchJson<SrcStandingsResponse>({
      provider: PROVIDER,
      url: `${BASE}?data=results&category=tables&league=${league}`,
    });
    if (!res.success) return null;

    const table = res.data.standings?.[0]?.table ?? [];
    if (table.length === 0) return null;

    // Vendor sanity check: sportsrc sometimes serves last season's final
    // table under new-season metadata (observed with UEFA CL in Sept 2026:
    // season.startDate=2026-09-08, currentMatchday=1, but every team shows
    // 8 played). If the reported season hasn't started yet and teams show
    // games played, treat the payload as stale and refuse to ingest it —
    // otherwise the app displays fake rankings.
    const startDate = new Date(res.data.season.startDate);
    const now = new Date();
    const maxPlayed = table.reduce((m, r) => Math.max(m, r.playedGames), 0);
    if (startDate > now && maxPlayed > 0) {
      return null;
    }

    const rows: NormalizedStandingRow[] = table.map((row) => ({
      position: row.position,
      teamId: `sportsrc:team:${row.team.id}`,
      teamName: row.team.name,
      teamLogoUrl: row.team.crest,
      played: row.playedGames,
      won: row.won,
      drawn: row.draw,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
      form: row.form ?? undefined,
    }));

    return {
      competitionId: `sportsrc:${league}`,
      competitionName: res.data.competition.name,
      season: seasonLabel(res.data.season),
      rows,
      providerRef: {
        provider: PROVIDER,
        externalId: `standings:${league}:${res.data.filters?.season ?? seasonLabel(res.data.season)}`,
      },
    };
  }

  /* ── Internals ───────────────────────────────────────────────────────── */

  /**
   * Normalize an incoming `competitionId` (could be our internal ID, a
   * sportsrc code, or a competition name) to a valid SPORTSRC_LEAGUES key.
   */
  private resolveLeague(competitionId?: string): SportsrcLeagueCode | null {
    if (!competitionId) return 'PL';
    const upper = competitionId.toUpperCase();
    if (upper in SPORTSRC_LEAGUES) return upper as SportsrcLeagueCode;
    // Allow "sportsrc:PL", "sportsrc:standings:PL:2026", etc.
    for (const key of Object.keys(SPORTSRC_LEAGUES) as SportsrcLeagueCode[]) {
      if (upper.includes(`:${key}`) || upper.endsWith(`-${key}`)) return key;
    }
    // Best-effort name match.
    const wanted = competitionId.toLowerCase();
    for (const [code, name] of Object.entries(SPORTSRC_LEAGUES)) {
      if (name.toLowerCase() === wanted) return code as SportsrcLeagueCode;
    }
    return null;
  }

  private normalizeMatch(m: SrcMatch): NormalizedMatch {
    return {
      id: `sportsrc:${m.id}`,
      sport: 'football',
      competitionId: `sportsrc:${m.competition.code}`,
      competitionName: m.competition.name,
      homeTeam: {
        id: `sportsrc:team:${m.homeTeam.id}`,
        name: m.homeTeam.name,
        shortName: m.homeTeam.shortName,
        logoUrl: m.homeTeam.crest,
      },
      awayTeam: {
        id: `sportsrc:team:${m.awayTeam.id}`,
        name: m.awayTeam.name,
        shortName: m.awayTeam.shortName,
        logoUrl: m.awayTeam.crest,
      },
      startsAt: new Date(m.utcDate),
      status: mapStatus(m.status),
      score: {
        home: m.score?.fullTime?.home ?? null,
        away: m.score?.fullTime?.away ?? null,
      },
      round: m.matchday ? `Matchday ${m.matchday}` : undefined,
      providerRef: { provider: PROVIDER, externalId: String(m.id) },
    };
  }
}

/* ── Form-from-history fallback (ported from domingoberbel's laliga_transform.py) ── */

export interface FinishedMatchLite {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  startsAt: Date;
}

/**
 * Derive a 5-character "WWDLW"-style form string for a team from its recent
 * finished matches (newest first). Returns an empty string when we don't
 * have enough data. Kairos uses this as a fallback when the standings row
 * for a competition doesn't include a `form` field.
 *
 * Ported from the pattern used in dominberbel98/domingoberbel.com — his
 * `laliga_transform.py` derives form by folding new results into the
 * previous run's JSON, since upstream feeds only carry a rolling window.
 */
export function deriveFormFromResults(
  teamId: string,
  finishedMatches: FinishedMatchLite[],
  maxResults = 5,
): string {
  const sorted = [...finishedMatches].sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime(),
  );

  const letters: string[] = [];
  for (const m of sorted) {
    if (letters.length >= maxResults) break;
    if (m.homeScore == null || m.awayScore == null) continue;

    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;

    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    letters.push(gf > ga ? 'W' : gf < ga ? 'L' : 'D');
  }

  return letters.join('');
}
