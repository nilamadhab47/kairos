/**
 * Normalized domain types for the sports data layer.
 * All provider adapters normalize into these shapes.
 */

export type SportId = 'football' | 'cricket' | 'tennis' | 'basketball' | 'f1' | 'hockey' | 'baseball';

export interface NormalizedCompetition {
  id: string;
  name: string;
  sport: SportId;
  country?: string;
  logoUrl?: string;
  season?: string;
  providerRef: ProviderRef;
}

export interface NormalizedTeam {
  id: string;
  name: string;
  shortName?: string;
  sport: SportId;
  competitionIds: string[];
  country?: string;
  logoUrl?: string;
  providerRef: ProviderRef;
}

export interface NormalizedPlayer {
  id: string;
  name: string;
  teamId?: string;
  sport: SportId;
  position?: string;
  imageUrl?: string;
  providerRef: ProviderRef;
}

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled' | 'postponed';

/**
 * A match participant. `name` is the full canonical form ("India",
 * "Mumbai Indians"). `shortName` is the provider shortcode ("IND", "MI").
 * We always store the long form in `Team.name` — the shortcode is a
 * secondary display used only when space is tight.
 */
export interface NormalizedMatchTeam {
  id: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
}

export interface NormalizedMatch {
  id: string;
  sport: SportId;
  competitionId: string;
  competitionName: string;
  /**
   * Present for head-to-head sports. Omitted for solo/session sports like F1,
   * where a session (Practice / Qualifying / Race) has no opponent pair.
   */
  homeTeam?: NormalizedMatchTeam;
  awayTeam?: NormalizedMatchTeam;
  startsAt: Date;
  status: MatchStatus;
  score?: { home: number | null; away: number | null };
  venue?: string;
  round?: string;
  metadata?: Record<string, unknown>;
  providerRef: ProviderRef;
}

export interface NormalizedMatchEvent {
  matchId: string;
  minute?: number;
  type: 'goal' | 'card' | 'substitution' | 'var' | 'penalty' | 'other';
  team: 'home' | 'away';
  playerName?: string;
  detail?: string;
}

export interface NormalizedStandingRow {
  position: number;
  teamId: string;
  teamName: string;
  teamLogoUrl?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: string;
}

export interface NormalizedStandings {
  competitionId: string;
  competitionName: string;
  season: string;
  rows: NormalizedStandingRow[];
  providerRef: ProviderRef;
}

export interface ProviderRef {
  provider: string;
  externalId: string;
}

// Cricket-specific extensions
export interface CricketScorecard {
  matchId: string;
  innings: CricketInnings[];
  providerRef: ProviderRef;
}

export interface CricketInnings {
  team: string;
  runs: number;
  wickets: number;
  overs: number;
  batting: CricketBattingEntry[];
  bowling: CricketBowlingEntry[];
}

export interface CricketBattingEntry {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal?: string;
}

export interface CricketBowlingEntry {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}
