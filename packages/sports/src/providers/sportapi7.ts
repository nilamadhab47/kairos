/**
 * SportAPI7 adapter — RapidAPI multi-sport provider.
 * Supports football, cricket, tennis, basketball, and more.
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
  NormalizedMatchEvent,
  NormalizedStandingRow,
  MatchStatus,
  SportId,
} from '../types.js';

import { providerFetchJson, setRateLimit, ProviderError } from '../http.js';

const SPORTAPI7_HOST = 'sportapi7.p.rapidapi.com';
const BASE_URL = `https://${SPORTAPI7_HOST}`;
const PROVIDER = 'SportAPI7';
setRateLimit(SPORTAPI7_HOST, { requests: 8, intervalMs: 60_000 });

// SportAPI7 (SofaScore-backed) uses sport slugs in path segments, not numeric IDs.
// Verified against live API: /api/v1/sport/football/events/live, /api/v1/sport/tennis/...
const SPORT_SLUGS: Partial<Record<SportId, string>> = {
  football: 'football',
  tennis: 'tennis',
  basketball: 'basketball',
  hockey: 'ice-hockey',
  cricket: 'cricket',
};

function getApiKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY env var is required for SportAPI7');
  return key;
}

async function fetchApi<T>(path: string): Promise<T> {
  return providerFetchJson<T>({
    provider: PROVIDER,
    url: `${BASE_URL}${path}`,
    headers: {
      'x-rapidapi-key': getApiKey(),
      'x-rapidapi-host': SPORTAPI7_HOST,
      Accept: 'application/json',
    },
  });
}

function mapStatus(statusCode: number): MatchStatus {
  // SportAPI7 status codes: 0=not started, 6/7=finished, 100=ended
  if (statusCode === 0) return 'scheduled';
  if (statusCode === 100 || statusCode === 6 || statusCode === 7) return 'completed';
  if (statusCode === 5) return 'cancelled';
  if (statusCode === 9) return 'postponed';
  return 'live';
}

function mapEvent(event: any, sport: SportId = 'football'): NormalizedMatch {
  const home = event.homeTeam ?? {};
  const away = event.awayTeam ?? {};
  const homeScore = event.homeScore ?? {};
  const awayScore = event.awayScore ?? {};
  const uniqueTournamentId =
    event.tournament?.uniqueTournament?.id ?? event.tournament?.id ?? 'unknown';

  return {
    id: `sportapi7:${event.id}`,
    sport,
    competitionId: `sportapi7:tournament:${uniqueTournamentId}`,
    competitionName: event.tournament?.name ?? 'Unknown',
    homeTeam: {
      id: `sportapi7:team:${home.id}`,
      name: home.name ?? home.shortName ?? 'TBD',
      logoUrl: home.id ? `https://api.sofascore.app/api/v1/team/${home.id}/image` : undefined,
    },
    awayTeam: {
      id: `sportapi7:team:${away.id}`,
      name: away.name ?? away.shortName ?? 'TBD',
      logoUrl: away.id ? `https://api.sofascore.app/api/v1/team/${away.id}/image` : undefined,
    },
    startsAt: new Date(event.startTimestamp * 1000),
    status: mapStatus(event.status?.code ?? 0),
    score: {
      home: homeScore.current ?? null,
      away: awayScore.current ?? null,
    },
    venue: event.venue?.stadium?.name,
    round: event.roundInfo?.round ? `Round ${event.roundInfo.round}` : undefined,
    metadata: {
      statusDescription: event.status?.description,
      slug: event.slug,
      season: event.season?.year ?? event.season?.name,
      uniqueTournamentId,
    },
    providerRef: { provider: 'sportapi7', externalId: String(event.id) },
  };
}

export class SportAPI7Provider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: 'SportAPI7',
    sports: ['football', 'cricket', 'tennis', 'basketball', 'hockey'],
    priority: 1,
  };

  async healthCheck(): Promise<boolean> {
    try {
      await fetchApi('/api/v1/sport/football/events/live');
      return true;
    } catch {
      return false;
    }
  }

  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    const slug = SPORT_SLUGS[opts.sport];
    if (!slug) return [];

    // Prefer live feed when asked; otherwise try scheduled-by-date, then live as
    // a real-data fallback (scheduled-events date path 404s on some plans/days).
    const attempts: string[] = [];
    if (opts.live) {
      attempts.push(`/api/v1/sport/${slug}/events/live`);
    } else {
      const date = opts.date ?? new Date().toISOString().split('T')[0];
      attempts.push(`/api/v1/sport/${slug}/scheduled-events/${date}`);
      attempts.push(`/api/v1/sport/${slug}/events/live`);
    }

    let events: any[] = [];
    let lastErr: unknown;
    for (const path of attempts) {
      try {
        const data = await fetchApi<{ events?: any[] }>(path);
        events = data.events ?? [];
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr && events.length === 0) throw lastErr;

    let matches = events.map((e) => mapEvent(e, opts.sport));

    if (opts.competitionId) {
      matches = matches.filter((m) => m.competitionId === opts.competitionId);
    }

    return matches;
  }

  /**
   * Resolve the current (or named) season id for a unique tournament.
   */
  async resolveSeasonId(
    tournamentId: number | string,
    seasonHint?: string,
  ): Promise<{ seasonId: number; seasonName: string; year?: string }> {
    const data = await fetchApi<{ seasons?: any[] }>(
      `/api/v1/unique-tournament/${tournamentId}/seasons`,
    );
    const seasons = data.seasons ?? [];
    if (seasons.length === 0) {
      throw new Error(`SportAPI7: no seasons for tournament ${tournamentId}`);
    }
    if (seasonHint) {
      const hint = String(seasonHint);
      const match =
        seasons.find((s) => String(s.year) === hint || String(s.name) === hint) ??
        seasons.find((s) => String(s.name).includes(hint) || String(s.year).includes(hint));
      if (match) {
        return {
          seasonId: match.id,
          seasonName: match.name ?? String(match.year ?? match.id),
          year: match.year != null ? String(match.year) : undefined,
        };
      }
    }
    const current = seasons[0];
    return {
      seasonId: current.id,
      seasonName: current.name ?? String(current.year ?? current.id),
      year: current.year != null ? String(current.year) : undefined,
    };
  }

  /**
   * Full-ish season calendar via paginated next + last event pages.
   * Real provider data only — never fabricates fixtures.
   * On mid-pagination 429, returns whatever pages were collected (partial).
   */
  async fetchTournamentSeason(
    tournamentId: number | string,
    opts?: {
      seasonHint?: string;
      /** Skip seasons lookup when the SofaScore season id is already known. */
      seasonId?: number;
      seasonName?: string;
      maxPages?: number;
      sport?: SportId;
    },
  ): Promise<{
    matches: NormalizedMatch[];
    seasonId: number;
    seasonName: string;
    partial: boolean;
    pagesFetched: number;
  }> {
    const sport = opts?.sport ?? 'football';
    const maxPages = opts?.maxPages ?? 40;
    let seasonId = opts?.seasonId;
    let seasonName = opts?.seasonName;
    if (seasonId == null) {
      const resolved = await this.resolveSeasonIdWithRetry(tournamentId, opts?.seasonHint);
      seasonId = resolved.seasonId;
      seasonName = resolved.seasonName;
    }
    seasonName = seasonName ?? String(seasonId);

    const byId = new Map<string, NormalizedMatch>();
    let pagesFetched = 0;
    let partial = false;

    for (const direction of ['next', 'last'] as const) {
      for (let page = 0; page < maxPages; page += 1) {
        const path = `/api/v1/unique-tournament/${tournamentId}/season/${seasonId}/events/${direction}/${page}`;
        let data: { events?: any[]; hasNextPage?: boolean };
        try {
          data = await fetchApi(path);
        } catch (err) {
          if (page === 0 && direction === 'last') break;
          if (err instanceof ProviderError && err.status === 429 && byId.size > 0) {
            partial = true;
            break;
          }
          if (err instanceof ProviderError && err.status === 404) break;
          // Hard 429 before any page: wait once and retry this page.
          if (err instanceof ProviderError && err.status === 429) {
            await new Promise((r) => setTimeout(r, 25_000));
            try {
              data = await fetchApi(path);
            } catch (err2) {
              throw err2;
            }
          } else {
            throw err;
          }
        }
        pagesFetched += 1;
        const events = data.events ?? [];
        for (const e of events) {
          const m = mapEvent(e, sport);
          m.metadata = {
            ...(m.metadata ?? {}),
            season: seasonName,
            seasonId,
            partialSeason: false,
          };
          byId.set(m.providerRef.externalId, m);
        }
        if (!data.hasNextPage || events.length === 0) break;
      }
      if (partial) break;
    }

    const matches = [...byId.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    if (partial) {
      for (const m of matches) {
        m.metadata = { ...(m.metadata ?? {}), partialSeason: true };
      }
    }

    return { matches, seasonId, seasonName, partial, pagesFetched };
  }

  private async resolveSeasonIdWithRetry(
    tournamentId: number | string,
    seasonHint?: string,
    attempts = 3,
  ): Promise<{ seasonId: number; seasonName: string; year?: string }> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await this.resolveSeasonId(tournamentId, seasonHint);
      } catch (err) {
        lastErr = err;
        if (err instanceof ProviderError && err.status === 429 && i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 20_000 * (i + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async fetchCompetitions(sport: SportId): Promise<NormalizedCompetition[]> {
    const slug = SPORT_SLUGS[sport];
    if (!slug) return [];

    const data = await fetchApi<{ groups?: any[] }>(`/api/v1/sport/${slug}/categories`);
    const groups = data.groups ?? [];

    const competitions: NormalizedCompetition[] = [];
    for (const group of groups) {
      const tournaments = group.uniqueTournaments ?? [];
      for (const t of tournaments) {
        competitions.push({
          id: `sportapi7:tournament:${t.id}`,
          name: t.name,
          sport,
          country: group.name,
          providerRef: { provider: 'sportapi7', externalId: String(t.id) },
        });
      }
    }
    return competitions;
  }

  async fetchTeams(opts: SearchTeamsOpts): Promise<NormalizedTeam[]> {
    if (!opts.query) return [];

    const data = await fetchApi<{ teams?: any[] }>(`/api/v1/search/teams/${encodeURIComponent(opts.query)}`);
    const teams = data.teams ?? [];

    return teams.map((t: any) => ({
      id: `sportapi7:team:${t.id}`,
      name: t.name,
      shortName: t.shortName,
      sport: opts.sport,
      competitionIds: [],
      country: t.country?.name,
      logoUrl: t.id ? `https://api.sofascore.app/api/v1/team/${t.id}/image` : undefined,
      providerRef: { provider: 'sportapi7', externalId: String(t.id) },
    }));
  }

  async fetchStandings(opts: FetchStandingsOpts): Promise<NormalizedStandings | null> {
    const tournamentId = opts.competitionId
      .replace('sportapi7:tournament:', '')
      .replace(/^tournament:/, '');
    const { seasonId, seasonName } = await this.resolveSeasonId(tournamentId, opts.season);

    const data = await fetchApi<{ standings?: any[] }>(
      `/api/v1/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`,
    );
    const standingsGroup = data.standings?.[0];
    if (!standingsGroup) return null;

    const rows: NormalizedStandingRow[] = (standingsGroup.rows ?? []).map((r: any) => ({
      position: r.position,
      teamId: `sportapi7:team:${r.team?.id}`,
      teamName: r.team?.name ?? 'Unknown',
      teamLogoUrl: r.team?.id ? `https://api.sofascore.app/api/v1/team/${r.team.id}/image` : undefined,
      played: r.matches ?? 0,
      won: r.wins ?? 0,
      drawn: r.draws ?? 0,
      lost: r.losses ?? 0,
      goalsFor: r.scoresFor ?? 0,
      goalsAgainst: r.scoresAgainst ?? 0,
      goalDifference: (r.scoresFor ?? 0) - (r.scoresAgainst ?? 0),
      points: r.points ?? 0,
      form: undefined,
    }));

    return {
      competitionId: `sportapi7:tournament:${tournamentId}`,
      competitionName: standingsGroup.tournament?.name ?? 'Unknown',
      season: seasonName,
      rows,
      providerRef: { provider: 'sportapi7', externalId: `${tournamentId}:${seasonId}` },
    };
  }

  async fetchMatchEvents(matchId: string): Promise<NormalizedMatchEvent[]> {
    const externalId = matchId.replace('sportapi7:', '');
    const data = await fetchApi<{ incidents?: any[] }>(`/api/v1/event/${externalId}/incidents`);
    const incidents = data.incidents ?? [];

    return incidents
      .filter((i: any) => ['goal', 'card', 'substitution', 'varDecision', 'penaltyShootout'].includes(i.incidentType))
      .map((i: any) => ({
        matchId,
        minute: i.time,
        type: i.incidentType === 'varDecision' ? 'var' : (i.incidentType as any) ?? 'other',
        team: i.isHome ? 'home' : 'away',
        playerName: i.player?.name ?? i.playerName,
        detail: i.text ?? i.description,
      }));
  }
}
