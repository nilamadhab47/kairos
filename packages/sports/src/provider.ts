/**
 * SportsProvider interface — every adapter implements this.
 * Methods return normalized types; optional methods return undefined if unsupported.
 */

import type {
  SportId,
  NormalizedMatch,
  NormalizedCompetition,
  NormalizedTeam,
  NormalizedStandings,
  NormalizedMatchEvent,
  CricketScorecard,
} from './types.js';

export interface SportsProviderConfig {
  name: string;
  sports: SportId[];
  priority: number; // lower = higher priority
}

export interface FetchMatchesOpts {
  sport: SportId;
  date?: string; // YYYY-MM-DD
  competitionId?: string;
  live?: boolean;
}

export interface FetchStandingsOpts {
  sport: SportId;
  competitionId: string;
  season?: string;
}

export interface SearchTeamsOpts {
  sport: SportId;
  query?: string;
  competitionId?: string;
}

export interface SportsProvider {
  readonly config: SportsProviderConfig;

  /** Health check — is this provider currently responding? */
  healthCheck(): Promise<boolean>;

  /** Fixtures/matches by date or live */
  fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]>;

  /** Competitions/leagues available */
  fetchCompetitions?(sport: SportId): Promise<NormalizedCompetition[]>;

  /** Teams (search or by competition) */
  fetchTeams?(opts: SearchTeamsOpts): Promise<NormalizedTeam[]>;

  /** League standings */
  fetchStandings?(opts: FetchStandingsOpts): Promise<NormalizedStandings | null>;

  /** Match events (goals, cards, etc.) */
  fetchMatchEvents?(matchId: string): Promise<NormalizedMatchEvent[]>;

  /** Cricket scorecard (cricket providers only) */
  fetchCricketScorecard?(matchId: string): Promise<CricketScorecard | null>;
}
