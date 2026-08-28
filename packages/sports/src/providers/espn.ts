/**
 * ESPN adapter — publicly accessible JSON endpoints.
 *
 * Covers: soccer (200+ leagues), NFL, NBA, WNBA, MLB, NHL, cricket, tennis,
 * F1, NASCAR, college football/basketball/baseball/hockey, MMA, golf, rugby.
 *
 * Hosts:
 *   - site.api.espn.com  — scoreboard, teams, news, summary, playbyplay
 *   - sports.core.api.espn.com — deep hierarchical model (seasons, athletes, etc.)
 *   - site.web.api.espn.com — richer standings
 *
 * Notes:
 *   - No key required.
 *   - Rate-limits by IP burst; keep polling to <=1 req/sec per host per instance.
 *   - Historical scoreboards: append ?dates=YYYYMMDD (or YYYY for a season).
 */

import type {
  SportsProvider,
  SportsProviderConfig,
  FetchMatchesOpts,
  FetchStandingsOpts,
  SearchTeamsOpts,
  FetchMatchEventsOpts,
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

import { providerFetchJson, setRateLimit } from '../http.js';

const SITE = 'https://site.api.espn.com/apis/site/v2';
/** Same JSON as SITE, but this host is less often Cloudflare-blocked. */
const SITE_WEB = 'https://site.web.api.espn.com/apis/site/v2';
const WEB = 'https://site.web.api.espn.com/apis/v2';
const CORE = 'https://sports.core.api.espn.com/v2';
const PROVIDER = 'ESPN';

// ESPN's public JSON endpoints tolerate about 1 req/sec per host per IP.
// Anything faster gets Cloudflare-fingerprinted and returns 403.
setRateLimit('site.api.espn.com', { requests: 30, intervalMs: 60_000 });
setRateLimit('site.web.api.espn.com', { requests: 30, intervalMs: 60_000 });
setRateLimit('sports.core.api.espn.com', { requests: 30, intervalMs: 60_000 });

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * ESPN "sport / league" slugs. Kairo sport id -> [{ sport, league }]
 * We ingest a curated primary set per sport; extend freely — ESPN supports many.
 */
export const ESPN_LEAGUES: Record<SportId, Array<{ sport: string; league: string; label: string }>> = {
  football: [
    { sport: 'soccer', league: 'eng.1', label: 'Premier League' },
    { sport: 'soccer', league: 'esp.1', label: 'La Liga' },
    { sport: 'soccer', league: 'ita.1', label: 'Serie A' },
    { sport: 'soccer', league: 'ger.1', label: 'Bundesliga' },
    { sport: 'soccer', league: 'fra.1', label: 'Ligue 1' },
    { sport: 'soccer', league: 'usa.1', label: 'MLS' },
    { sport: 'soccer', league: 'ind.1', label: 'Indian Super League' },
    { sport: 'soccer', league: 'uefa.champions', label: 'UEFA Champions League' },
    { sport: 'soccer', league: 'uefa.europa', label: 'UEFA Europa League' },
    { sport: 'soccer', league: 'uefa.europa.conf', label: 'UEFA Conference League' },
    { sport: 'soccer', league: 'fifa.world', label: 'FIFA World Cup' },
    { sport: 'soccer', league: 'eng.fa', label: 'FA Cup' },
    { sport: 'soccer', league: 'eng.league_cup', label: 'EFL Cup' },
    { sport: 'soccer', league: 'esp.copa_del_rey', label: 'Copa del Rey' },
    { sport: 'soccer', league: 'esp.super_cup', label: 'Supercopa de España' },
    { sport: 'soccer', league: 'ita.coppa_italia', label: 'Coppa Italia' },
    { sport: 'soccer', league: 'ger.dfb_pokal', label: 'DFB-Pokal' },
    { sport: 'soccer', league: 'eng.charity', label: 'Community Shield' },
  ],
  cricket: [
    { sport: 'cricket', league: '8039', label: 'International Cricket' },
    { sport: 'cricket', league: '8048', label: 'IPL / Domestic' },
  ],
  tennis: [
    { sport: 'tennis', league: 'atp', label: 'ATP' },
    { sport: 'tennis', league: 'wta', label: 'WTA' },
  ],
  basketball: [
    { sport: 'basketball', league: 'nba', label: 'NBA' },
    { sport: 'basketball', league: 'wnba', label: 'WNBA' },
    { sport: 'basketball', league: 'mens-college-basketball', label: 'NCAAM' },
    { sport: 'basketball', league: 'fiba', label: 'FIBA' },
  ],
  f1: [{ sport: 'racing', league: 'f1', label: 'Formula 1' }],
  hockey: [{ sport: 'hockey', league: 'nhl', label: 'NHL' }],
  baseball: [{ sport: 'baseball', league: 'mlb', label: 'MLB' }],
};

/** Leagues we prioritize for "today / upcoming" match reminders. */
export const ESPN_REMINDER_SOCCER_LEAGUES = [
  'eng.1',
  'esp.1',
  'ita.1',
  'ger.1',
  'fra.1',
  'uefa.champions',
  'uefa.europa',
  'uefa.europa.conf',
  'eng.fa',
  'eng.league_cup',
  'eng.charity',
  'esp.copa_del_rey',
  'esp.super_cup',
  'ita.coppa_italia',
  'ger.dfb_pokal',
  'usa.1',
  'ind.1',
] as const;

async function fetchJson<T>(url: string): Promise<T> {
  return providerFetchJson<T>({
    provider: PROVIDER,
    url,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
}

function mapStatus(state: string | undefined, completed?: boolean): MatchStatus {
  const s = (state ?? '').toLowerCase();
  if (completed || s === 'post') return 'completed';
  if (s === 'in') return 'live';
  if (s === 'pre') return 'scheduled';
  if (s === 'postponed') return 'postponed';
  if (s === 'canceled' || s === 'cancelled') return 'cancelled';
  return 'scheduled';
}

interface EspnScoreboard {
  leagues?: Array<{ id: string; name: string; abbreviation?: string; season?: { year: number } }>;
  events?: EspnEvent[];
}

interface EspnEvent {
  id: string;
  date: string;
  name: string;
  shortName?: string;
  competitions: Array<{
    id: string;
    date: string;
    venue?: { fullName?: string; address?: { city?: string; country?: string } };
    status: { type: { state: string; completed?: boolean; description?: string; shortDetail?: string } };
    competitors: Array<{
      id: string;
      homeAway: 'home' | 'away';
      score?: string;
      team: { id: string; displayName: string; abbreviation?: string; logo?: string; logos?: Array<{ href: string }> };
    }>;
    details?: Array<any>;
  }>;
  status?: { type: { state: string; completed?: boolean } };
}

function eventToMatch(
  ev: EspnEvent,
  kairoSport: SportId,
  leagueId: string,
  leagueName: string,
): NormalizedMatch | null {
  const comp = ev.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors.find((c) => c.homeAway === 'home') ?? comp.competitors[0];
  const away = comp.competitors.find((c) => c.homeAway === 'away') ?? comp.competitors[1];
  if (!home || !away) return null;

  const status = mapStatus(comp.status?.type?.state, comp.status?.type?.completed);
  const homeScore = home.score != null ? Number.parseInt(home.score, 10) : null;
  const awayScore = away.score != null ? Number.parseInt(away.score, 10) : null;

  return {
    id: `espn:${ev.id}`,
    sport: kairoSport,
    competitionId: `espn:${leagueId}`,
    competitionName: leagueName,
    homeTeam: {
      id: `espn:team:${home.team.id}`,
      name: home.team.displayName,
      logoUrl: home.team.logo ?? home.team.logos?.[0]?.href,
    },
    awayTeam: {
      id: `espn:team:${away.team.id}`,
      name: away.team.displayName,
      logoUrl: away.team.logo ?? away.team.logos?.[0]?.href,
    },
    startsAt: new Date(ev.date),
    status,
    score: { home: Number.isFinite(homeScore) ? homeScore : null, away: Number.isFinite(awayScore) ? awayScore : null },
    venue: comp.venue?.fullName,
    round: comp.status?.type?.description,
    metadata: {
      shortName: ev.shortName,
      shortDetail: comp.status?.type?.shortDetail,
    },
    providerRef: { provider: 'espn', externalId: ev.id },
  };
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function fmtYearMonth(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addUtcMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

const ESPN_SKIP_EVENT =
  /kickoff|halftime|start[- ]?2nd|end regular|start delay|end delay|end of|second half begins|first half begins/i;

function soccerSlugsToTry(preferred?: string): string[] {
  const cleaned = preferred?.trim().replace(/^soccer\//, '');
  const football = ESPN_LEAGUES.football ?? [];
  if (cleaned) {
    return [cleaned, ...football.map((l) => l.league).filter((s) => s !== cleaned)];
  }
  return football.map((l) => l.league);
}

function parseClockMinute(clock: unknown): number | undefined {
  const c = clock as { displayValue?: string; value?: number } | null | undefined;
  const display = c?.displayValue?.trim();
  if (display) {
    const m = display.match(/(\d+)\s*(?:'\s*\+\s*(\d+))?/);
    if (m) return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
  }
  const v = c?.value;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v > 130 ? Math.floor(v / 60) : Math.floor(v);
  }
  return undefined;
}

function competitorSides(data: any): { home?: string; away?: string } {
  const comps = data?.header?.competitions?.[0]?.competitors;
  if (!Array.isArray(comps)) return {};
  const home = comps.find((c: any) => c?.homeAway === 'home');
  const away = comps.find((c: any) => c?.homeAway === 'away');
  return {
    home: home?.id != null ? String(home.id) : home?.team?.id != null ? String(home.team.id) : undefined,
    away: away?.id != null ? String(away.id) : away?.team?.id != null ? String(away.team.id) : undefined,
  };
}

function teamIdOf(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
  const obj = raw as { id?: string | number };
  return obj.id != null ? String(obj.id) : undefined;
}

function playerFromEvent(raw: any): string | undefined {
  const parts = raw?.participants ?? raw?.athletesInvolved ?? [];
  if (!Array.isArray(parts) || parts.length === 0) return undefined;
  const first = parts[0];
  return (
    first?.athlete?.displayName ??
    first?.displayName ??
    first?.athlete?.shortName ??
    undefined
  );
}

function classifyEspnEvent(raw: any): NormalizedMatchEvent['type'] | null {
  const slug = String(raw?.type?.type ?? raw?.type?.text ?? '').toLowerCase();
  const text = String(raw?.text ?? raw?.shortText ?? '');
  if (ESPN_SKIP_EVENT.test(slug) || ESPN_SKIP_EVENT.test(text)) return null;
  if (raw?.redCard) return 'card';
  if (raw?.ownGoal || /own[- ]?goal/.test(slug)) return 'goal';
  if (raw?.penaltyKick || /missed[- ]?penalty/.test(slug)) return 'penalty';
  if (/penalty/.test(slug)) return 'penalty';
  if (raw?.scoringPlay || /^goal$/.test(slug) || slug.includes('goal')) return 'goal';
  if (slug.includes('card') || /yellow|red/.test(slug)) return 'card';
  if (slug.includes('sub')) return 'substitution';
  if (slug.includes('var')) return 'var';
  return null;
}

function sideForTeamId(
  teamId: string | undefined,
  homeId?: string,
  awayId?: string,
): 'home' | 'away' {
  if (teamId && awayId && teamId === awayId) return 'away';
  if (teamId && homeId && teamId === homeId) return 'home';
  return 'home';
}

/**
 * Map an ESPN soccer summary payload into MatchEvent rows.
 * Prefers `keyEvents` (goals, cards, subs); falls back to scoring `details`.
 */
export function parseEspnSoccerSummary(
  data: unknown,
  matchId: string,
  opts?: { homeTeamExternalId?: string; awayTeamExternalId?: string },
): NormalizedMatchEvent[] {
  const payload = data as any;
  const fromHeader = competitorSides(payload);
  const homeId = opts?.homeTeamExternalId ?? fromHeader.home;
  const awayId = opts?.awayTeamExternalId ?? fromHeader.away;

  const keyEvents: any[] = Array.isArray(payload?.keyEvents) ? payload.keyEvents : [];
  const source =
    keyEvents.length > 0
      ? keyEvents
      : Array.isArray(payload?.header?.competitions?.[0]?.details)
        ? payload.header.competitions[0].details
        : [];

  const out: NormalizedMatchEvent[] = [];
  for (const raw of source) {
    const type = classifyEspnEvent(raw);
    if (!type) continue;
    const teamId = teamIdOf(raw.team);
    out.push({
      matchId,
      minute: parseClockMinute(raw.clock ?? raw.time),
      type,
      team: sideForTeamId(teamId, homeId, awayId),
      playerName: playerFromEvent(raw),
      detail: typeof raw.text === 'string' ? raw.text : raw.shortText,
    });
  }
  return out.slice(0, 200);
}

export class ESPNProvider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: 'ESPN',
    sports: ['football', 'cricket', 'tennis', 'basketball', 'f1', 'hockey', 'baseball'],
    priority: 3, // primary-for-free, secondary to paid providers
  };

  async healthCheck(): Promise<boolean> {
    try {
      await fetchJson(`${SITE}/sports/basketball/nba/scoreboard`);
      return true;
    } catch {
      return false;
    }
  }

  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    const leagues = ESPN_LEAGUES[opts.sport] ?? [];
    if (leagues.length === 0) return [];

    // If a specific competition id was requested, restrict to that one
    const filtered = opts.competitionId
      ? leagues.filter((l) => `espn:${l.league}` === opts.competitionId)
      : leagues;

    const dateSuffix = opts.date ? `?dates=${opts.date.replace(/-/g, '')}` : '';

    const all: NormalizedMatch[] = [];
    for (const lg of filtered) {
      try {
        const url = `${SITE}/sports/${lg.sport}/${lg.league}/scoreboard${dateSuffix}`;
        const data = await fetchJson<EspnScoreboard>(url);
        const seasonName = data.leagues?.[0]?.season
          ? String((data.leagues[0].season as { displayName?: string; year?: number }).displayName
              ?? (data.leagues[0].season as { year?: number }).year
              ?? '')
          : undefined;
        for (const ev of data.events ?? []) {
          const m = eventToMatch(ev, opts.sport, lg.league, lg.label);
          if (!m) continue;
          if (seasonName) m.metadata = { ...(m.metadata ?? {}), season: seasonName };
          if (opts.live && m.status !== 'live') continue;
          all.push(m);
        }
      } catch {
        // continue on individual league failure
      }
    }
    return all;
  }

  /**
   * Reminder-oriented soccer fixture window.
   * Uses ESPN monthly scoreboard (`?dates=YYYYMM`) — verified to return the
   * month's fixtures for major leagues (EPL, La Liga, cups, UEFA, etc.).
   * Live scores are incidental; upcoming/today schedules are the goal.
   */
  async fetchSoccerFixtureWindow(opts?: {
    /** Inclusive months ahead from current UTC month (0 = this month only). Default 3. */
    monthsAhead?: number;
    /** ESPN league slugs; defaults to reminder set (EPL, La Liga, UCL, FA Cup, …). */
    leagueSlugs?: string[];
  }): Promise<{
    matches: NormalizedMatch[];
    months: string[];
    byLeague: Record<string, number>;
    errors: Array<{ league: string; month: string; message: string }>;
  }> {
    const monthsAhead = Math.max(0, opts?.monthsAhead ?? 3);
    const slugSet = new Set(
      opts?.leagueSlugs ?? [...ESPN_REMINDER_SOCCER_LEAGUES],
    );
    const leagues = (ESPN_LEAGUES.football ?? []).filter((l) => slugSet.has(l.league));

    const now = new Date();
    const months: string[] = [];
    for (let i = 0; i <= monthsAhead; i += 1) {
      months.push(fmtYearMonth(addUtcMonths(now, i)));
    }

    const byId = new Map<string, NormalizedMatch>();
    const byLeague: Record<string, number> = {};
    const errors: Array<{ league: string; month: string; message: string }> = [];

    for (const lg of leagues) {
      let leagueCount = 0;
      for (const ym of months) {
        try {
          const url = `${SITE}/sports/${lg.sport}/${lg.league}/scoreboard?dates=${ym}`;
          const data = await fetchJson<EspnScoreboard>(url);
          const seasonName = data.leagues?.[0]?.season
            ? String(
                (data.leagues[0].season as { displayName?: string; year?: number }).displayName
                  ?? (data.leagues[0].season as { year?: number }).year
                  ?? '',
              )
            : undefined;
          for (const ev of data.events ?? []) {
            const m = eventToMatch(ev, 'football', lg.league, lg.label);
            if (!m) continue;
            if (seasonName) m.metadata = { ...(m.metadata ?? {}), season: seasonName };
            if (!byId.has(m.providerRef.externalId)) leagueCount += 1;
            byId.set(m.providerRef.externalId, m);
          }
        } catch (err) {
          errors.push({
            league: lg.league,
            month: ym,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      byLeague[lg.label] = leagueCount;
    }

    const matches = [...byId.values()].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
    return { matches, months, byLeague, errors };
  }

  async fetchCompetitions(sport: SportId): Promise<NormalizedCompetition[]> {
    const leagues = ESPN_LEAGUES[sport] ?? [];
    return leagues.map((l) => ({
      id: `espn:${l.league}`,
      name: l.label,
      sport,
      providerRef: { provider: 'espn', externalId: `${l.sport}/${l.league}` },
    }));
  }

  async fetchTeams(opts: SearchTeamsOpts): Promise<NormalizedTeam[]> {
    const leagues = ESPN_LEAGUES[opts.sport] ?? [];
    const teams: NormalizedTeam[] = [];
    for (const lg of leagues) {
      try {
        const data = await fetchJson<any>(`${SITE}/sports/${lg.sport}/${lg.league}/teams`);
        const raw = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
        for (const t of raw) {
          const team = t.team ?? t;
          const name = team.displayName ?? team.name;
          if (opts.query && !name.toLowerCase().includes(opts.query.toLowerCase())) continue;
          teams.push({
            id: `espn:team:${team.id}`,
            name,
            shortName: team.abbreviation,
            sport: opts.sport,
            competitionIds: [`espn:${lg.league}`],
            logoUrl: team.logos?.[0]?.href,
            providerRef: { provider: 'espn', externalId: team.id },
          });
        }
      } catch {
        // continue
      }
    }
    return teams;
  }

  async fetchStandings(opts: FetchStandingsOpts): Promise<NormalizedStandings | null> {
    const leagueSlug = opts.competitionId.replace(/^espn:/, '');
    // Find the ESPN sport root for this league
    const match = Object.values(ESPN_LEAGUES)
      .flat()
      .find((l) => l.league === leagueSlug);
    if (!match) return null;

    try {
      // site.web.api gives richer standings than site.api for soccer
      const url = `${WEB}/sports/${match.sport}/${match.league}/standings`;
      const data = await fetchJson<any>(url);
      const child = data?.children?.[0];
      const entries = child?.standings?.entries ?? data?.standings?.entries ?? [];

      const rows: NormalizedStandingRow[] = entries.map((e: any, idx: number) => {
        const stats = new Map<string, number>((e.stats ?? []).map((s: any) => [s.name, Number(s.value ?? 0)]));
        return {
          position: stats.get('rank') ?? idx + 1,
          teamId: `espn:team:${e.team?.id}`,
          teamName: e.team?.displayName ?? e.team?.name ?? 'Unknown',
          teamLogoUrl: e.team?.logos?.[0]?.href,
          played: stats.get('gamesPlayed') ?? 0,
          won: stats.get('wins') ?? 0,
          drawn: stats.get('ties') ?? 0,
          lost: stats.get('losses') ?? 0,
          goalsFor: stats.get('pointsFor') ?? stats.get('goalsFor') ?? 0,
          goalsAgainst: stats.get('pointsAgainst') ?? stats.get('goalsAgainst') ?? 0,
          goalDifference: stats.get('pointDifferential') ?? stats.get('goalDifference') ?? 0,
          points: stats.get('points') ?? 0,
          form: undefined,
        };
      });

      if (rows.length === 0) return null;

      return {
        competitionId: opts.competitionId,
        competitionName: data?.name ?? match.label,
        season: String(data?.season?.year ?? opts.season ?? new Date().getFullYear()),
        rows,
        providerRef: { provider: 'espn', externalId: `${match.sport}/${match.league}` },
      };
    } catch {
      return null;
    }
  }

  async fetchMatchEvents(
    matchId: string,
    opts?: FetchMatchEventsOpts,
  ): Promise<NormalizedMatchEvent[]> {
    const externalId = matchId.replace(/^espn:/i, '');
    const slugs = soccerSlugsToTry(opts?.leagueSlug);
    for (const league of slugs) {
      for (const origin of [SITE_WEB, SITE]) {
        try {
          const url = `${origin}/sports/soccer/${league}/summary?event=${externalId}`;
          const data = await fetchJson<unknown>(url);
          // A 200 for this event id is authoritative — don't probe other leagues.
          return parseEspnSoccerSummary(data, matchId, {
            homeTeamExternalId: opts?.homeTeamExternalId,
            awayTeamExternalId: opts?.awayTeamExternalId,
          });
        } catch {
          // try next host / league
        }
      }
      // Preferred slug exhausted both hosts; only then fan out.
      if (opts?.leagueSlug) continue;
    }
    return [];
  }

  /** Fetch news headlines for a given ESPN league slug (bonus utility). */
  async fetchNews(sport: SportId, limit = 10): Promise<Array<{ headline: string; url: string; published: string }>> {
    const leagues = ESPN_LEAGUES[sport] ?? [];
    const out: Array<{ headline: string; url: string; published: string }> = [];
    for (const lg of leagues.slice(0, 2)) {
      try {
        const data = await fetchJson<any>(`${SITE}/sports/${lg.sport}/${lg.league}/news`);
        for (const a of (data?.articles ?? []).slice(0, limit)) {
          out.push({ headline: a.headline, url: a.links?.web?.href ?? '', published: a.published });
        }
      } catch {
        // continue
      }
    }
    return out;
  }
}

export function espnDateString(d: Date): string {
  return fmtDate(d);
}
