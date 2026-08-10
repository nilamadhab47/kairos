/**
 * API-Football adapter — api-sports.io football data.
 * Free tier: 100 req/day, historical seasons only. Paid plans unlock current season.
 * Live provider data only — no fabricated fallback.
 */

import type {
  SportsProvider,
  SportsProviderConfig,
  FetchMatchesOpts,
  FetchStandingsOpts,
  SearchTeamsOpts,
} from '../provider.js';
import type {
  NormalizedMatch,
  NormalizedCompetition,
  NormalizedTeam,
  NormalizedStandings,
  NormalizedStandingRow,
  MatchStatus,
  SportId,
} from '../types.js';
import { providerFetchJson, setRateLimit } from '../http.js';

const BASE_URL = (process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io').replace(/\/$/, '');
setRateLimit(new URL(BASE_URL).host, { requests: 20, intervalMs: 60_000 });

const PROVIDER = 'API-Football';

function getApiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY env var is required');
  return key;
}

async function fetchApi<T>(path: string): Promise<T> {
  return providerFetchJson<T>({
    provider: PROVIDER,
    url: `${BASE_URL}${path}`,
    headers: {
      'x-apisports-key': getApiKey(),
      Accept: 'application/json',
    },
  });
}

function mapFixtureStatus(short: string): MatchStatus {
  const live = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];
  const finished = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
  const cancelled = ['CANC', 'ABD'];
  const postponed = ['PST'];
  if (live.includes(short)) return 'live';
  if (finished.includes(short)) return 'completed';
  if (cancelled.includes(short)) return 'cancelled';
  if (postponed.includes(short)) return 'postponed';
  return 'scheduled';
}

export class APIFootballProvider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: PROVIDER,
    sports: ['football'],
    priority: 5,
  };

  async healthCheck(): Promise<boolean> {
    try {
      const data = await fetchApi<{ response?: unknown }>('/status');
      return Boolean(data?.response);
    } catch {
      return false;
    }
  }

  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    if (opts.sport !== 'football') return [];

    const params = new URLSearchParams();
    if (opts.live) params.set('live', 'all');
    else if (opts.date) params.set('date', opts.date);
    else params.set('date', new Date().toISOString().slice(0, 10));
    if (opts.competitionId) {
      params.set('league', opts.competitionId.replace('apifootball:league:', ''));
    }

    const data = await fetchApi<{ response?: any[] }>(`/fixtures?${params.toString()}`);
    const fixtures = data.response ?? [];

    return fixtures.map((f: any) => ({
      id: `apifootball:${f.fixture.id}`,
      sport: 'football' as SportId,
      competitionId: `apifootball:league:${f.league.id}`,
      competitionName: f.league.name,
      homeTeam: {
        id: `apifootball:team:${f.teams.home.id}`,
        name: f.teams.home.name,
        logoUrl: f.teams.home.logo,
      },
      awayTeam: {
        id: `apifootball:team:${f.teams.away.id}`,
        name: f.teams.away.name,
        logoUrl: f.teams.away.logo,
      },
      startsAt: new Date(f.fixture.date),
      status: mapFixtureStatus(f.fixture.status.short),
      score: { home: f.goals.home, away: f.goals.away },
      venue: f.fixture.venue?.name,
      round: f.league.round,
      metadata: {
        referee: f.fixture.referee,
        elapsed: f.fixture.status.elapsed,
        season: f.league.season,
        leagueLogo: f.league.logo,
      },
      providerRef: { provider: 'api-football', externalId: String(f.fixture.id) },
    }));
  }

  /** Fetch fixtures for a specific league + season window. Used by ingest jobs. */
  async fetchLeagueSeason(leagueId: number, season: number, opts?: { from?: string; to?: string }): Promise<NormalizedMatch[]> {
    const params = new URLSearchParams({ league: String(leagueId), season: String(season) });
    if (opts?.from) params.set('from', opts.from);
    if (opts?.to) params.set('to', opts.to);
    const data = await fetchApi<{ response?: any[]; errors?: unknown }>(`/fixtures?${params.toString()}`);
    if (data.errors && Object.keys(data.errors as object).length > 0) {
      throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
    }
    const fixtures = data.response ?? [];
    return fixtures.map((f: any) => ({
      id: `apifootball:${f.fixture.id}`,
      sport: 'football' as SportId,
      competitionId: `apifootball:league:${f.league.id}`,
      competitionName: f.league.name,
      homeTeam: {
        id: `apifootball:team:${f.teams.home.id}`,
        name: f.teams.home.name,
        logoUrl: f.teams.home.logo,
      },
      awayTeam: {
        id: `apifootball:team:${f.teams.away.id}`,
        name: f.teams.away.name,
        logoUrl: f.teams.away.logo,
      },
      startsAt: new Date(f.fixture.date),
      status: mapFixtureStatus(f.fixture.status.short),
      score: { home: f.goals.home, away: f.goals.away },
      venue: f.fixture.venue?.name,
      round: f.league.round,
      metadata: {
        season: f.league.season,
        leagueLogo: f.league.logo,
      },
      providerRef: { provider: 'api-football', externalId: String(f.fixture.id) },
    }));
  }

  async fetchCompetitions(_sport: SportId): Promise<NormalizedCompetition[]> {
    const data = await fetchApi<{ response?: any[] }>('/leagues');
    const leagues = data.response ?? [];

    return leagues.map((l: any) => ({
      id: `apifootball:league:${l.league.id}`,
      name: l.league.name,
      sport: 'football' as SportId,
      country: l.country.name,
      logoUrl: l.league.logo,
      providerRef: { provider: 'api-football', externalId: String(l.league.id) },
    }));
  }

  async fetchTeams(opts: SearchTeamsOpts): Promise<NormalizedTeam[]> {
    if (!opts.query) return [];
    const data = await fetchApi<{ response?: any[] }>(`/teams?search=${encodeURIComponent(opts.query)}`);
    const teams = data.response ?? [];

    return teams.map((t: any) => ({
      id: `apifootball:team:${t.team.id}`,
      name: t.team.name,
      shortName: t.team.code,
      sport: 'football' as SportId,
      competitionIds: [],
      country: t.team.country,
      logoUrl: t.team.logo,
      providerRef: { provider: 'api-football', externalId: String(t.team.id) },
    }));
  }

  async fetchStandings(opts: FetchStandingsOpts): Promise<NormalizedStandings | null> {
    const leagueId = opts.competitionId.replace('apifootball:league:', '');
    const season = opts.season ?? String(new Date().getUTCFullYear());
    const data = await fetchApi<{ response?: any[] }>(`/standings?league=${leagueId}&season=${season}`);
    const resp = data.response?.[0];
    if (!resp) return null;

    const standings = resp.league?.standings?.[0];
    if (!standings) return null;

    const rows: NormalizedStandingRow[] = standings.map((r: any) => ({
      position: r.rank,
      teamId: `apifootball:team:${r.team.id}`,
      teamName: r.team.name,
      teamLogoUrl: r.team.logo,
      played: r.all.played,
      won: r.all.win,
      drawn: r.all.draw,
      lost: r.all.lose,
      goalsFor: r.all.goals.for,
      goalsAgainst: r.all.goals.against,
      goalDifference: r.goalsDiff,
      points: r.points,
      form: r.form,
    }));

    return {
      competitionId: opts.competitionId,
      competitionName: resp.league.name,
      season,
      rows,
      providerRef: { provider: 'api-football', externalId: `${leagueId}:${season}` },
    };
  }
}
