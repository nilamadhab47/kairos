/**
 * Cricbuzz (RapidAPI) adapter — premier cricket data provider.
 * Covers international, IPL, The Hundred, BBL, CPL, PSL, and domestic.
 */

import type {
  SportsProvider,
  SportsProviderConfig,
  FetchMatchesOpts,
  FetchStandingsOpts,
} from '../provider.js';
import type {
  NormalizedMatch,
  NormalizedCompetition,
  NormalizedStandings,
  NormalizedMatchEvent,
  CricketScorecard,
  CricketInnings,
  CricketBattingEntry,
  CricketBowlingEntry,
  MatchStatus,
  SportId,
} from '../types.js';

import { providerFetchJson, setRateLimit } from '../http.js';

const CRICBUZZ_HOST = 'cricbuzz-cricket.p.rapidapi.com';
const BASE_URL = `https://${CRICBUZZ_HOST}`;
const PROVIDER = 'Cricbuzz';
setRateLimit(CRICBUZZ_HOST, { requests: 10, intervalMs: 60_000 });

function getApiKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY env var is required for Cricbuzz');
  return key;
}

async function fetchApi<T>(path: string): Promise<T> {
  return providerFetchJson<T>({
    provider: PROVIDER,
    url: `${BASE_URL}${path}`,
    headers: {
      'x-rapidapi-key': getApiKey(),
      'x-rapidapi-host': CRICBUZZ_HOST,
      Accept: 'application/json',
    },
  });
}

function mapMatchState(state: string | undefined): MatchStatus {
  if (!state) return 'scheduled';
  const s = state.toLowerCase();
  if (s === 'complete') return 'completed';
  if (s === 'in progress' || s === 'innings break' || s === 'stumps' || s === 'drink') return 'live';
  if (s === 'abandoned' || s === 'cancelled') return 'cancelled';
  if (s === 'preview' || s === 'upcoming') return 'scheduled';
  return 'scheduled';
}

function parseCricbuzzEpoch(raw: unknown): Date {
  // Cricbuzz returns start/end timestamps as strings of milliseconds since epoch.
  if (raw == null) return new Date(NaN);
  const n = typeof raw === 'number' ? raw : Number(String(raw));
  if (!Number.isFinite(n) || n <= 0) return new Date(NaN);
  return new Date(n);
}

function mapCricketMatch(match: any, seriesName?: string): NormalizedMatch {
  const info = match.matchInfo ?? match;
  const score = match.matchScore;

  let homeScore: number | null = null;
  let awayScore: number | null = null;

  if (score) {
    const t1 = score.team1Score?.inngs1;
    const t2 = score.team2Score?.inngs1;
    if (t1) homeScore = t1.runs ?? null;
    if (t2) awayScore = t2.runs ?? null;
  }

  return {
    id: `cricbuzz:${info.matchId}`,
    sport: 'cricket',
    competitionId: `cricbuzz:series:${info.seriesId}`,
    competitionName: seriesName ?? info.seriesName ?? 'Unknown Series',
    // Prefer the full team name — the 3-letter shortcode goes into `shortName`
    // so the UI can render "India" instead of "IND" and TheSportsDB can find
    // logos when we enrich.
    homeTeam: {
      id: `cricbuzz:team:${info.team1?.teamId}`,
      name: info.team1?.teamName ?? info.team1?.teamSName ?? 'TBD',
      shortName: info.team1?.teamSName ?? undefined,
    },
    awayTeam: {
      id: `cricbuzz:team:${info.team2?.teamId}`,
      name: info.team2?.teamName ?? info.team2?.teamSName ?? 'TBD',
      shortName: info.team2?.teamSName ?? undefined,
    },
    startsAt: parseCricbuzzEpoch(info.startDate),
    status: mapMatchState(info.state),
    score: { home: homeScore, away: awayScore },
    venue: info.venueInfo?.ground
      ? `${info.venueInfo.ground}, ${info.venueInfo.city ?? ''}`
      : undefined,
    round: info.matchDesc,
    metadata: {
      matchFormat: info.matchFormat,
      status: info.status,
      stateTitle: info.stateTitle,
    },
    providerRef: { provider: 'cricbuzz', externalId: String(info.matchId) },
  };
}

export class CricbuzzProvider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: 'Cricbuzz',
    sports: ['cricket'],
    priority: 1,
  };

  async healthCheck(): Promise<boolean> {
    try {
      await fetchApi('/matches/v1/recent');
      return true;
    } catch {
      return false;
    }
  }

  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    if (opts.sport !== 'cricket') return [];

    let path: string;
    if (opts.live) {
      path = '/matches/v1/live';
    } else {
      path = '/matches/v1/upcoming';
    }

    const data = await fetchApi<{ typeMatches?: any[] }>(path);
    const typeMatches = data.typeMatches ?? [];

    const matches: NormalizedMatch[] = [];
    for (const type of typeMatches) {
      const seriesMatches = type.seriesMatches ?? [];
      for (const series of seriesMatches) {
        const seriesAdWrapper = series.seriesAdWrapper ?? series;
        const matchList = seriesAdWrapper.matches ?? [];
        const seriesName = seriesAdWrapper.seriesName;
        for (const m of matchList) {
          matches.push(mapCricketMatch(m, seriesName));
        }
      }
    }

    return matches;
  }

  /**
   * List series in a Cricbuzz category: international | league | domestic | women.
   */
  async listSeries(
    category: 'international' | 'league' | 'domestic' | 'women' = 'international',
  ): Promise<Array<{ id: string; name: string; month?: string; category: string }>> {
    const data = await fetchApi<{ seriesMapProto?: any[] }>(`/series/v1/${category}`);
    const out: Array<{ id: string; name: string; month?: string; category: string }> = [];
    for (const group of data.seriesMapProto ?? []) {
      for (const s of group.series ?? []) {
        out.push({
          id: String(s.id),
          name: s.name,
          month: group.date,
          category,
        });
      }
    }
    return out;
  }

  /**
   * Fetch all matches for a series via `/series/v1/{id}` matchDetails.
   */
  async fetchSeriesMatches(seriesId: string | number): Promise<NormalizedMatch[]> {
    const data = await fetchApi<{
      matchDetails?: Array<{ matchDetailsMap?: { key?: string; match?: any[] } }>;
      seriesName?: string;
    }>(`/series/v1/${seriesId}`);

    const seriesName = data.seriesName;
    const matches: NormalizedMatch[] = [];
    for (const block of data.matchDetails ?? []) {
      const map = block.matchDetailsMap;
      if (!map?.match) continue;
      for (const m of map.match) {
        matches.push(
          mapCricketMatch(m, seriesName ?? m.matchInfo?.seriesName),
        );
      }
    }
    return matches;
  }

  async fetchCompetitions(_sport: SportId): Promise<NormalizedCompetition[]> {
    const cats: Array<'international' | 'league' | 'domestic' | 'women'> = [
      'international',
      'league',
      'domestic',
      'women',
    ];
    const competitions: NormalizedCompetition[] = [];
    for (const cat of cats) {
      const series = await this.listSeries(cat);
      for (const s of series) {
        competitions.push({
          id: `cricbuzz:series:${s.id}`,
          name: s.name,
          sport: 'cricket',
          country: undefined,
          season: s.month,
          providerRef: { provider: 'cricbuzz', externalId: s.id },
        });
      }
    }
    return competitions;
  }

  async fetchStandings(opts: FetchStandingsOpts): Promise<NormalizedStandings | null> {
    // Cricbuzz doesn't have a generic standings endpoint like football
    // Points tables are per-series
    const seriesId = opts.competitionId.replace('cricbuzz:series:', '');
    try {
      const data = await fetchApi<{ pointsTable?: any[] }>(`/stats/v1/series/${seriesId}/points-table`);
      const tables = data.pointsTable ?? [];
      if (tables.length === 0) return null;

      const table = tables[0];
      const rows = (table.pointsTableInfo ?? []).map((r: any, idx: number) => ({
        position: idx + 1,
        teamId: `cricbuzz:team:${r.teamId}`,
        teamName: r.teamName ?? 'Unknown',
        played: r.matchesPlayed ?? 0,
        won: r.matchesWon ?? 0,
        drawn: r.matchesTied ?? 0,
        lost: r.matchesLost ?? 0,
        goalsFor: r.for ?? 0,
        goalsAgainst: r.against ?? 0,
        goalDifference: 0,
        points: r.points ?? 0,
        form: undefined,
      }));

      return {
        competitionId: opts.competitionId,
        competitionName: table.groupName ?? 'Points Table',
        season: opts.season ?? '',
        rows,
        providerRef: { provider: 'cricbuzz', externalId: seriesId },
      };
    } catch {
      return null;
    }
  }

  async fetchCricketScorecard(matchId: string): Promise<CricketScorecard | null> {
    const externalId = matchId.replace('cricbuzz:', '');
    try {
      const data = await fetchApi<any>(`/mcenter/v1/${externalId}/hscard`);
      const scoreCard = data.scoreCard ?? [];

      const innings: CricketInnings[] = scoreCard.map((inning: any) => {
        const batData = inning.batTeamDetails ?? {};
        const bowlData = inning.bowlTeamDetails ?? {};

        const batting: CricketBattingEntry[] = Object.values(batData.batsmenData ?? {}).map((b: any) => ({
          name: b.batName ?? 'Unknown',
          runs: b.runs ?? 0,
          balls: b.balls ?? 0,
          fours: b.fours ?? 0,
          sixes: b.sixes ?? 0,
          strikeRate: b.strikeRate ?? 0,
          dismissal: b.outDesc,
        }));

        const bowling: CricketBowlingEntry[] = Object.values(bowlData.bowlersData ?? {}).map((bw: any) => ({
          name: bw.bowlName ?? 'Unknown',
          overs: bw.overs ?? 0,
          maidens: bw.maidens ?? 0,
          runs: bw.runs ?? 0,
          wickets: bw.wickets ?? 0,
          economy: bw.economy ?? 0,
        }));

        return {
          team: batData.batTeamName ?? 'Unknown',
          runs: inning.scoreDetails?.runs ?? 0,
          wickets: inning.scoreDetails?.wickets ?? 0,
          overs: inning.scoreDetails?.overs ?? 0,
          batting,
          bowling,
        };
      });

      return {
        matchId,
        innings,
        providerRef: { provider: 'cricbuzz', externalId },
      };
    } catch {
      return null;
    }
  }

  async fetchMatchEvents(matchId: string): Promise<NormalizedMatchEvent[]> {
    // Cricket doesn't have "events" in the same way as football
    // Return wickets as events
    const scorecard = await this.fetchCricketScorecard(matchId);
    if (!scorecard) return [];

    const events: NormalizedMatchEvent[] = [];
    for (const inning of scorecard.innings) {
      for (const bat of inning.batting) {
        if (bat.dismissal) {
          events.push({
            matchId,
            type: 'other',
            team: 'home',
            playerName: bat.name,
            detail: `OUT: ${bat.dismissal} (${bat.runs} runs off ${bat.balls} balls)`,
          });
        }
      }
    }
    return events;
  }
}
