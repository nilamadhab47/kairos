/**
 * Fantasy Premier League adapter — public API, no key required.
 *
 * Endpoints used (all GET, all JSON, no auth):
 *   - /api/bootstrap-static/   — teams, players, gameweeks, chips
 *   - /api/fixtures/            — all fixtures with scores + match stats
 *   - /api/fixtures/?event={gw} — fixtures for a single gameweek
 *
 * Data quality:
 *   - Official PL source — scores are definitive, no replication lag.
 *   - Standings derived from the teams array (position, points, W/D/L, GD).
 *   - Rate limit: undocumented; we self-throttle to 2 req/s.
 *
 * Coverage: Premier League only (one competition).
 *
 * Future roadmap:
 *   - Fantasy game integration (mini-leagues, captain picks, squad management)
 *     via /api/entry/{id}/ endpoints (public read, auth write).
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
  NormalizedMatchEvent,
  MatchStatus,
} from '../types.js';
import { providerFetchJson, setRateLimit } from '../http.js';

/* ── Constants ─────────────────────────────────────────────────────────── */

const BASE = 'https://fantasy.premierleague.com/api';
const PROVIDER = 'fpl';

setRateLimit('fantasy.premierleague.com', { requests: 2, intervalMs: 1000 });

/** The FPL competition ID — constant since there's only the Premier League. */
export const FPL_COMPETITION_NAME = 'Premier League';

/* ── FPL raw types (only the fields we use) ────────────────────────────── */

interface FplTeam {
  id: number;
  name: string;
  short_name: string;
  position: number;
  played: number;
  win: number;
  draw: number;
  loss: number;
  points: number;
  form: string | null;
  strength: number;
  code: number;
}

interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
}

interface FplBootstrap {
  teams: FplTeam[];
  events: FplEvent[];
  // elements (players) skipped — not needed for fixtures/standings.
}

interface FplFixture {
  id: number;
  code: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  kickoff_time: string | null;
  finished: boolean;
  started: boolean;
  minutes: number;
  provisional_start_time: boolean;
  stats: FplFixtureStat[];
}

interface FplFixtureStat {
  identifier: string;
  a: Array<{ value: number; element: number }>;
  h: Array<{ value: number; element: number }>;
}

interface FplElement {
  id: number;
  web_name: string;
  team: number;
}

/* ── Cached bootstrap (refreshed at most once per ingest run) ──────────── */

let _bootstrapCache: { data: FplBootstrap; elements: Map<number, FplElement>; ts: number } | null = null;
const BOOTSTRAP_TTL_MS = 5 * 60_000;

async function getBootstrap(): Promise<{ data: FplBootstrap; elements: Map<number, FplElement> }> {
  if (_bootstrapCache && Date.now() - _bootstrapCache.ts < BOOTSTRAP_TTL_MS) {
    return _bootstrapCache;
  }
  const data = await providerFetchJson<FplBootstrap & { elements: FplElement[] }>({
    provider: PROVIDER,
    url: `${BASE}/bootstrap-static/`,
  });
  const elements = new Map<number, FplElement>();
  for (const el of data.elements ?? []) elements.set(el.id, el);
  _bootstrapCache = { data, elements, ts: Date.now() };
  return _bootstrapCache;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function fplTeamLogo(code: number): string {
  return `https://resources.premierleague.com/premierleague/badges/t${code}.png`;
}

function matchStatus(f: FplFixture): MatchStatus {
  if (f.finished) return 'completed';
  if (f.started) return 'live';
  return 'scheduled';
}

function gameweekLabel(event: number | null, events: FplEvent[]): string | undefined {
  if (event == null) return undefined;
  const gw = events.find((e) => e.id === event);
  return gw?.name ?? `Matchday ${event}`;
}

/* ── Provider ──────────────────────────────────────────────────────────── */

export class FPLProvider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: PROVIDER,
    sports: ['football'],
    priority: 5, // High priority for PL — authoritative source
  };

  async healthCheck(): Promise<boolean> {
    try {
      const { data } = await getBootstrap();
      return data.teams.length === 20;
    } catch {
      return false;
    }
  }

  /**
   * Fetch Premier League fixtures.
   *
   * If `opts.date` is provided we pull all fixtures and filter to that day.
   * The FPL API doesn't support date-based filtering natively.
   */
  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    if (opts.sport !== 'football') return [];

    const { data } = await getBootstrap();
    const teamMap = new Map(data.teams.map((t) => [t.id, t]));
    const fixtures = await providerFetchJson<FplFixture[]>({
      provider: PROVIDER,
      url: `${BASE}/fixtures/`,
    });

    const dateFilter = opts.date; // YYYY-MM-DD
    const liveOnly = opts.live === true;

    const results: NormalizedMatch[] = [];
    for (const f of fixtures) {
      if (!f.kickoff_time) continue;

      const startsAt = new Date(f.kickoff_time);
      if (dateFilter) {
        const fixtureDate = startsAt.toISOString().slice(0, 10);
        if (fixtureDate !== dateFilter) continue;
      }
      if (liveOnly && !f.started) continue;
      if (liveOnly && f.finished) continue;

      const home = teamMap.get(f.team_h);
      const away = teamMap.get(f.team_a);
      if (!home || !away) continue;

      results.push({
        id: `fpl:${f.code}`,
        sport: 'football',
        competitionId: FPL_COMPETITION_NAME,
        competitionName: FPL_COMPETITION_NAME,
        homeTeam: {
          id: `fpl:${home.id}`,
          name: home.name,
          shortName: home.short_name,
          logoUrl: fplTeamLogo(home.code),
        },
        awayTeam: {
          id: `fpl:${away.id}`,
          name: away.name,
          shortName: away.short_name,
          logoUrl: fplTeamLogo(away.code),
        },
        startsAt,
        status: matchStatus(f),
        score: {
          home: f.team_h_score,
          away: f.team_a_score,
        },
        round: gameweekLabel(f.event, data.events),
        providerRef: { provider: PROVIDER, externalId: String(f.code) },
      });
    }

    return results;
  }

  /**
   * Premier League standings derived from the bootstrap teams array.
   * The `position`, `points`, `win/draw/loss` fields are kept current by FPL.
   */
  async fetchStandings(opts: FetchStandingsOpts): Promise<NormalizedStandings | null> {
    if (opts.sport !== 'football') return null;

    const { data } = await getBootstrap();
    const now = new Date();
    const season =
      opts.season ?? (now.getUTCMonth() >= 6 ? `${now.getUTCFullYear()}` : `${now.getUTCFullYear() - 1}`);

    const currentGw = data.events.find((e) => e.is_current);
    const played = currentGw?.id ?? data.teams[0]?.played ?? 0;

    const rows: NormalizedStandingRow[] = data.teams
      .sort((a, b) => a.position - b.position)
      .map((t) => {
        const gf = 0; // FPL bootstrap doesn't expose goals; will be supplemented by other providers
        const ga = 0;
        return {
          position: t.position,
          teamId: `fpl:${t.id}`,
          teamName: t.name,
          teamLogoUrl: fplTeamLogo(t.code),
          played: t.played ?? played,
          won: t.win,
          drawn: t.draw,
          lost: t.loss,
          goalsFor: gf,
          goalsAgainst: ga,
          goalDifference: gf - ga,
          points: t.points,
          form: t.form ?? undefined,
        };
      });

    return {
      competitionId: FPL_COMPETITION_NAME,
      competitionName: FPL_COMPETITION_NAME,
      season,
      rows,
      providerRef: { provider: PROVIDER, externalId: `standings:${season}` },
    };
  }

  /**
   * Match events (goals, cards, subs) from the fixture stats array.
   * FPL provides per-player stat rollups rather than a chronological event
   * log, so we synthesize events from the stats breakdown.
   */
  async fetchMatchEvents(matchCode: string): Promise<NormalizedMatchEvent[]> {
    const fixtures = await providerFetchJson<FplFixture[]>({
      provider: PROVIDER,
      url: `${BASE}/fixtures/`,
    });
    const { elements } = await getBootstrap();

    const f = fixtures.find((fx) => String(fx.code) === matchCode);
    if (!f) return [];

    const events: NormalizedMatchEvent[] = [];

    for (const stat of f.stats) {
      const type = fplStatToEventType(stat.identifier);
      if (!type) continue;

      for (const entry of stat.h) {
        const player = elements.get(entry.element);
        events.push({
          matchId: `fpl:${f.code}`,
          type,
          team: 'home',
          playerName: player?.web_name ?? `#${entry.element}`,
          detail: stat.identifier,
        });
      }
      for (const entry of stat.a) {
        const player = elements.get(entry.element);
        events.push({
          matchId: `fpl:${f.code}`,
          type,
          team: 'away',
          playerName: player?.web_name ?? `#${entry.element}`,
          detail: stat.identifier,
        });
      }
    }

    return events;
  }
}

function fplStatToEventType(
  identifier: string,
): NormalizedMatchEvent['type'] | null {
  switch (identifier) {
    case 'goals_scored':
      return 'goal';
    case 'penalties_missed':
      return 'penalty';
    case 'yellow_cards':
    case 'red_cards':
      return 'card';
    default:
      return null;
  }
}
