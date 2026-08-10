/**
 * TheSportsDB adapter — metadata/logo enrichment provider.
 * Free key falls back to "3"; set THESPORTSDB_API_KEY for higher limits.
 */

import type {
  SportsProvider,
  SportsProviderConfig,
  FetchMatchesOpts,
  SearchTeamsOpts,
} from '../provider.js';
import type {
  NormalizedMatch,
  NormalizedCompetition,
  NormalizedTeam,
  MatchStatus,
  SportId,
} from '../types.js';

import { providerFetchJson, setRateLimit } from '../http.js';

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';
const PROVIDER = 'TheSportsDB';
setRateLimit('www.thesportsdb.com', { requests: 30, intervalMs: 60_000 });

export type CompetitionLogoSkipReason =
  | 'no_curated_id_no_country'
  | 'curated_id_no_badge'
  | 'country_search_no_match'
  | 'country_search_no_badge';

export type CompetitionLogoResolution =
  | { ok: true; logoUrl: string; externalId: string }
  | { ok: false; reason: CompetitionLogoSkipReason };

export const THESPORTSDB_LICENSE_NOTE =
  'Club and competition marks are trademarks of their respective owners. Kairo displays logos for identification only and does not claim affiliation or endorsement.';

function getApiKey(): string {
  return process.env.THESPORTSDB_API_KEY?.trim() || '3';
}

async function fetchApi<T>(path: string): Promise<T> {
  return providerFetchJson<T>({
    provider: PROVIDER,
    url: `${BASE_URL}/${getApiKey()}${path}`,
    headers: { Accept: 'application/json' },
  });
}

const SPORT_NAMES: Partial<Record<SportId, string>> = {
  football: 'Soccer',
  cricket: 'Cricket',
  tennis: 'Tennis',
  basketball: 'Basketball',
  hockey: 'Ice Hockey',
  baseball: 'Baseball',
  f1: 'Motorsport',
};

/** Append TheSportsDB size suffix when missing (`/tiny` `/small` `/medium`). */
export function sizedArtworkUrl(
  url: string | null | undefined,
  size: 'tiny' | 'small' | 'medium' = 'small',
): string | null {
  if (!url) return null;
  if (/\/(tiny|small|medium)$/i.test(url)) return url;
  return `${url.replace(/\/$/, '')}/${size}`;
}

export function normalizeLeagueKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(20\d{2}([-/]20?\d{2})?)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Stable TheSportsDB league ids for Kairo reminder competitions.
 * Resolved via lookupleague (works on free key).
 */
export const CURATED_LEAGUE_IDS: Record<string, string> = {
  /* -------- Football (verified against lookupleague.php on free tier) --- */
  'premier league': '4328',
  'english premier league': '4328',
  epl: '4328',
  'la liga': '4335',
  'spanish la liga': '4335',
  'serie a': '4332',
  'italian serie a': '4332',
  bundesliga: '4331',
  'german bundesliga': '4331',
  'ligue 1': '4334',
  'french ligue 1': '4334',
  mls: '4346',
  'major league soccer': '4346',
  'uefa champions league': '4480',
  'champions league': '4480',
  'uefa europa league': '4481',
  'europa league': '4481',
  'fa cup': '4482',
  'efl cup': '4570',
  'carabao cup': '4570',
  'league cup': '4570',
  'dfb pokal': '4485',
  'copa del rey': '4483',
  'indian super league': '4811',
  isl: '4811',
  eredivisie: '4337',
  'fifa world cup': '4429',
  'world cup': '4429',

  /* -------- Motorsport ------------------------------------------------- */
  'formula 1': '4370',
  f1: '4370',

  /* -------- Cricket (verified via search_all_leagues.php?s=Cricket) ---- *
   * TheSportsDB free tier only carries five cricket leagues today.
   * Everything else (IPL, PSL, The Hundred, Ranji, Duleep, tours) is
   * NOT available and must be filled by our SVG pack or a paid provider.
   */
  bbl: '4461',
  'big bash': '4461',
  'australian big bash league': '4461',
  'big bash league': '4461',
  'sheffield shield': '5530',
  cpl: '5176',
  'caribbean premier league': '5176',
  bpl: '5529',
  'bangladesh premier league': '5529',
  'shpageeza cricket league': '5534',
};

type LeagueRow = {
  idLeague?: string;
  strLeague?: string;
  strLeagueAlternate?: string;
  strBadge?: string;
  strLogo?: string;
  strCountry?: string;
  strSport?: string;
};

type TeamRow = {
  idTeam?: string;
  strTeam?: string;
  strTeamShort?: string;
  strTeamBadge?: string;
  strBadge?: string;
  strSport?: string;
  idLeague?: string;
  strCountry?: string;
};

function badgeFromLeague(row: LeagueRow | undefined): string | null {
  return sizedArtworkUrl(row?.strBadge || row?.strLogo || null, 'small');
}

function badgeFromTeam(row: TeamRow | undefined): string | null {
  return sizedArtworkUrl(row?.strBadge || row?.strTeamBadge || null, 'small');
}

export class TheSportsDBProvider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: 'TheSportsDB',
    sports: ['football', 'cricket', 'tennis', 'basketball', 'hockey', 'baseball'],
    priority: 10,
  };

  async healthCheck(): Promise<boolean> {
    try {
      await fetchApi('/all_sports.php');
      return true;
    } catch {
      return false;
    }
  }

  async fetchMatches(_opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    return [];
  }

  async fetchCompetitions(sport: SportId): Promise<NormalizedCompetition[]> {
    const sportName = SPORT_NAMES[sport];
    if (!sportName) return [];

    const data = await fetchApi<{ countrys?: LeagueRow[] }>(
      `/search_all_leagues.php?s=${encodeURIComponent(sportName)}`,
    );
    const leagues = data.countrys ?? [];

    return leagues.map((l) => ({
      id: `thesportsdb:league:${l.idLeague}`,
      name: l.strLeague ?? 'Unknown',
      sport,
      country: l.strCountry,
      logoUrl: badgeFromLeague(l) ?? undefined,
      providerRef: { provider: 'thesportsdb', externalId: String(l.idLeague) },
    }));
  }

  async fetchTeams(opts: SearchTeamsOpts): Promise<NormalizedTeam[]> {
    if (!opts.query) return [];

    const data = await fetchApi<{ teams?: TeamRow[] }>(
      `/searchteams.php?t=${encodeURIComponent(opts.query)}`,
    );
    const teams = data.teams ?? [];

    return teams
      .filter((t) => {
        if (!opts.sport) return true;
        const sportName = SPORT_NAMES[opts.sport];
        return t.strSport === sportName;
      })
      .map((t) => ({
        id: `thesportsdb:team:${t.idTeam}`,
        name: t.strTeam ?? 'Unknown',
        shortName: t.strTeamShort || undefined,
        sport: opts.sport,
        competitionIds: t.idLeague ? [`thesportsdb:league:${t.idLeague}`] : [],
        country: t.strCountry,
        logoUrl: badgeFromTeam(t) ?? undefined,
        providerRef: { provider: 'thesportsdb', externalId: String(t.idTeam) },
      }));
  }

  async lookupLeagueById(id: string): Promise<{ name: string; logoUrl: string | null } | null> {
    const data = await fetchApi<{ leagues?: LeagueRow[] }>(
      `/lookupleague.php?id=${encodeURIComponent(id)}`,
    );
    const row = data.leagues?.[0];
    if (!row?.strLeague) return null;
    return { name: row.strLeague, logoUrl: badgeFromLeague(row) };
  }

  async searchLeaguesByCountry(country: string): Promise<LeagueRow[]> {
    const data = await fetchApi<{ countrys?: LeagueRow[]; countries?: LeagueRow[] }>(
      `/search_all_leagues.php?c=${encodeURIComponent(country)}`,
    );
    return data.countrys ?? data.countries ?? [];
  }

  /**
   * Resolve a competition badge by curated id, optional country list match.
   * Returns a discriminated result so callers can report *why* a lookup
   * yielded nothing (curated id missing badge, no country, name mismatch, …)
   * instead of collapsing every miss into an opaque `null`.
   * Network errors are re-thrown — the caller decides how to record them.
   */
  async resolveCompetitionLogo(
    competitionName: string,
    country?: string | null,
  ): Promise<CompetitionLogoResolution> {
    const key = normalizeLeagueKey(competitionName);
    const curatedId = CURATED_LEAGUE_IDS[key];

    if (curatedId) {
      const hit = await this.lookupLeagueById(curatedId);
      if (hit?.logoUrl) return { ok: true, logoUrl: hit.logoUrl, externalId: curatedId };
      // curated id resolved but TheSportsDB has no badge for it.
      if (!country?.trim()) return { ok: false, reason: 'curated_id_no_badge' };
      // Fall through to country search as a second attempt.
    }

    if (!country?.trim()) {
      return { ok: false, reason: 'no_curated_id_no_country' };
    }

    const leagues = await this.searchLeaguesByCountry(country.trim());
    const match = leagues.find((l) => {
      const primary = normalizeLeagueKey(l.strLeague ?? '');
      const alts = (l.strLeagueAlternate ?? '')
        .split(',')
        .map((a) => normalizeLeagueKey(a));
      return (
        primary === key ||
        alts.includes(key) ||
        (primary.length > 4 && (primary.includes(key) || key.includes(primary)))
      );
    });
    if (!match?.idLeague) {
      return { ok: false, reason: 'country_search_no_match' };
    }
    const logoUrl = badgeFromLeague(match);
    if (!logoUrl) {
      return { ok: false, reason: 'country_search_no_badge' };
    }
    return { ok: true, logoUrl, externalId: match.idLeague };
  }

  async getTeamLogo(teamName: string, sport?: SportId): Promise<string | null> {
    if (!teamName || teamName.trim().length < 3) return null;
    const data = await fetchApi<{ teams?: TeamRow[] }>(
      `/searchteams.php?t=${encodeURIComponent(teamName)}`,
    );
    const teams = data.teams ?? [];
    const sportName = sport ? SPORT_NAMES[sport] : undefined;
    const row =
      teams.find((t) => !sportName || t.strSport === sportName) ?? teams[0];
    return badgeFromTeam(row);
  }

  async getLeagueLogo(leagueName: string): Promise<string | null> {
    try {
      const resolved = await this.resolveCompetitionLogo(leagueName);
      return resolved.ok ? resolved.logoUrl : null;
    } catch {
      return null;
    }
  }

  /**
   * The full Formula 1 constructor grid, with badges + fanart.
   * TheSportsDB's Motorsport league id `4370` is "Formula 1".
   */
  async fetchF1Constructors(): Promise<
    Array<{
      externalId: string;
      name: string;
      shortName: string | null;
      badgeUrl: string | null;
      logoUrl: string | null;
      country: string | null;
    }>
  > {
    const data = await fetchApi<{ teams?: TeamRow[] & Array<{ strLogo?: string; strCountry?: string }> }>(
      '/search_all_teams.php?l=Formula%201',
    );
    const teams = data.teams ?? [];
    return teams
      .filter((t) => t.idTeam && t.strTeam)
      .map((t) => ({
        externalId: String(t.idTeam),
        name: String(t.strTeam),
        shortName: (t.strTeamShort ?? '').trim() || null,
        badgeUrl: sizedArtworkUrl(t.strBadge ?? null, 'small'),
        logoUrl: sizedArtworkUrl((t as { strLogo?: string }).strLogo ?? null, 'small'),
        country: (t as { strCountry?: string }).strCountry ?? null,
      }));
  }
}
