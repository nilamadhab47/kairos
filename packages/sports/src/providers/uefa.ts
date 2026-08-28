/**
 * UEFA official match API — Champions League (and later Europa / Conference).
 *
 * Host: match.uefa.com/v5  (the same JSON the UEFA.com fixtures page uses)
 * No API key. Public, rate-limit politely.
 *
 * Season year convention: UEFA `seasonYear=2027` is the 2026/27 season
 * (the year the league phase / final is played). Qualifying for that season
 * starts the previous July.
 *
 * Data rule: never invent kickoffs or opponents. Matches without a real
 * kickoff `dateTime` or with placeholder teams are skipped.
 */

import type {
  SportsProvider,
  SportsProviderConfig,
  FetchMatchesOpts,
  FetchMatchEventsOpts,
} from '../provider.js';
import type {
  NormalizedMatch,
  NormalizedCompetition,
  NormalizedMatchTeam,
  NormalizedMatchEvent,
  MatchStatus,
  SportId,
} from '../types.js';
import { providerFetchJson, setRateLimit } from '../http.js';

const BASE = 'https://match.uefa.com/v5';
const PROVIDER = 'uefa';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

setRateLimit('match.uefa.com', { requests: 20, intervalMs: 60_000 });

/** UEFA competition id → Kairo label + ESPN slug (for cross-provider merge). */
export const UEFA_COMPETITIONS = {
  ucl: {
    id: '1',
    name: 'UEFA Champions League',
    espnSlug: 'uefa.champions',
  },
} as const;

export type UefaCompetitionKey = keyof typeof UEFA_COMPETITIONS;

/**
 * Map UEFA short / official names onto the names ESPN and our catalog already
 * use, so a user who follows "Arsenal" still matches a UCL row.
 * Keys are accent-stripped, lowercased.
 */
const TEAM_CANONICAL: Record<string, string> = {
  paris: 'Paris Saint-Germain',
  'paris saint-germain': 'Paris Saint-Germain',
  'paris saint germain': 'Paris Saint-Germain',
  psg: 'Paris Saint-Germain',
  'bayern münchen': 'Bayern Munich',
  'bayern munchen': 'Bayern Munich',
  'bayern munich': 'Bayern Munich',
  bayern: 'Bayern Munich',
  'real madrid': 'Real Madrid',
  liverpool: 'Liverpool',
  internazionale: 'Inter Milan',
  inter: 'Inter Milan',
  'inter milan': 'Inter Milan',
  milan: 'AC Milan',
  'ac milan': 'AC Milan',
  'manchester city': 'Manchester City',
  'man. city': 'Manchester City',
  'man city': 'Manchester City',
  arsenal: 'Arsenal',
  barcelona: 'Barcelona',
  atleti: 'Atletico Madrid',
  atlético: 'Atletico Madrid',
  'atlético madrid': 'Atletico Madrid',
  'atletico madrid': 'Atletico Madrid',
  'borussia dortmund': 'Borussia Dortmund',
  dortmund: 'Borussia Dortmund',
  roma: 'AS Roma',
  'as roma': 'AS Roma',
  'sporting cp': 'Sporting CP',
  sporting: 'Sporting CP',
  'aston villa': 'Aston Villa',
  porto: 'FC Porto',
  'fc porto': 'FC Porto',
  'manchester united': 'Manchester United',
  'man. united': 'Manchester United',
  'man united': 'Manchester United',
  'club brugge': 'Club Brugge',
  'club brugge kv': 'Club Brugge',
  'real betis': 'Real Betis',
  betis: 'Real Betis',
  psv: 'PSV Eindhoven',
  'psv eindhoven': 'PSV Eindhoven',
  feyenoord: 'Feyenoord',
  lille: 'Lille',
  'bodø/glimt': 'Bodo/Glimt',
  'bodo/glimt': 'Bodo/Glimt',
  'bodo glimt': 'Bodo/Glimt',
  napoli: 'Napoli',
  'rb leipzig': 'RB Leipzig',
  leipzig: 'RB Leipzig',
  villarreal: 'Villarreal',
  'fenerbahçe': 'Fenerbahce',
  fenerbahce: 'Fenerbahce',
  'shakhtar donetsk': 'Shakhtar Donetsk',
  shakhtar: 'Shakhtar Donetsk',
  galatasaray: 'Galatasaray',
  'slavia praha': 'Slavia Prague',
  'slavia prague': 'Slavia Prague',
  's. bratislava': 'Slovan Bratislava',
  'slovan bratislava': 'Slovan Bratislava',
  stuttgart: 'VfB Stuttgart',
  'vfb stuttgart': 'VfB Stuttgart',
  'aek athens': 'AEK Athens',
  lask: 'LASK',
  como: 'Como',
  lens: 'Lens',
  viking: 'Viking',
  sabah: 'Sabah',
  lyon: 'Lyon',
  'olympique lyonnais': 'Lyon',
  celtic: 'Celtic',
  'gnk dinamo': 'Dinamo Zagreb',
  'dinamo zagreb': 'Dinamo Zagreb',
  'h. beer-sheva': 'Hapoel Beer-Sheva',
  'hapoel beer-sheva': 'Hapoel Beer-Sheva',
  'n.e.c.': 'NEC Nijmegen',
  nec: 'NEC Nijmegen',
  'l. red imps': 'Lincoln Red Imps',
  'lincoln red imps': 'Lincoln Red Imps',
};

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\b(fc|cf|sk|sc|ac|afc|cfc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalUefaTeamName(...candidates: Array<string | null | undefined>): string | null {
  const cleaned = candidates.map((c) => c?.trim()).filter((c): c is string => Boolean(c));
  for (const c of cleaned) {
    const hit = TEAM_CANONICAL[fold(c)];
    if (hit) return hit;
  }
  return cleaned[0] ?? null;
}

/** UEFA seasonYear for a calendar date. Aug 2026 → 2027 (2026/27 season). */
export function uefaSeasonYear(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export function uefaSeasonLabel(seasonYear: number): string {
  const start = seasonYear - 1;
  return `${start}/${String(seasonYear).slice(-2)}`;
}

interface UefaTeam {
  id?: string;
  internationalName?: string;
  officialName?: string;
  teamCode?: string;
  isPlaceHolder?: boolean;
  logoUrl?: string;
  mediumLogoUrl?: string;
  bigLogoUrl?: string;
  translations?: {
    displayName?: { EN?: string };
    displayOfficialName?: { EN?: string };
    shortName?: { EN?: string };
  };
}

interface UefaMatch {
  id: string | number;
  status?: string;
  seasonYear?: string | number;
  competitionPhase?: string;
  kickOffTime?: { date?: string; dateTime?: string };
  homeTeam?: UefaTeam;
  awayTeam?: UefaTeam;
  score?: { regular?: { home?: number; away?: number }; total?: { home?: number; away?: number } };
  round?: {
    id?: string;
    phase?: string;
    metaData?: { name?: string; type?: string };
    translations?: { name?: { EN?: string } };
  };
  matchday?: { name?: string; longName?: string; phase?: string; sequenceNumber?: string };
  stadium?: { name?: string; officialName?: string; city?: { translations?: { name?: { EN?: string } } } };
  competition?: { id?: string; metaData?: { name?: string } };
  playerEvents?: Record<string, unknown>;
}

export interface UefaFetchResult {
  matches: NormalizedMatch[];
  fetched: number;
  skippedPlaceholder: number;
  skippedNoKickoff: number;
  skippedUnnamed: number;
  byPhase: Record<string, number>;
  upcoming: number;
}

function mapStatus(raw: string | undefined): MatchStatus {
  const s = (raw ?? '').toUpperCase();
  if (s === 'FINISHED' || s === 'AWARDED') return 'completed';
  if (s === 'LIVE' || s === 'IN_PLAY' || s === 'PLAYING') return 'live';
  if (s === 'POSTPONED') return 'postponed';
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'ABANDONED') return 'cancelled';
  return 'scheduled';
}

function teamFrom(t: UefaTeam | undefined): NormalizedMatchTeam | null {
  if (!t || t.isPlaceHolder) return null;
  const name = canonicalUefaTeamName(
    t.internationalName,
    t.translations?.displayName?.EN,
    t.translations?.displayOfficialName?.EN,
    t.officialName,
  );
  if (!name || !t.id) return null;
  return {
    id: `uefa:team:${t.id}`,
    name,
    shortName: t.translations?.shortName?.EN ?? t.teamCode ?? undefined,
    logoUrl: t.mediumLogoUrl ?? t.logoUrl ?? t.bigLogoUrl,
  };
}

function roundLabel(m: UefaMatch): string | null {
  const named =
    m.round?.metaData?.name?.trim() ||
    m.round?.translations?.name?.EN?.trim() ||
    null;
  const md = m.matchday?.longName?.trim() || m.matchday?.name?.trim() || null;
  if (named && md && !named.toLowerCase().includes(md.toLowerCase())) {
    return `${named} · ${md}`;
  }
  return named ?? md;
}

function toMatch(
  raw: UefaMatch,
  competitionName: string,
  competitionId: string,
  seasonLabel: string,
): NormalizedMatch | 'placeholder' | 'no-kickoff' | 'unnamed' {
  const home = teamFrom(raw.homeTeam);
  const away = teamFrom(raw.awayTeam);
  if (raw.homeTeam?.isPlaceHolder || raw.awayTeam?.isPlaceHolder) return 'placeholder';
  if (!home || !away) return 'unnamed';

  const iso = raw.kickOffTime?.dateTime?.trim();
  if (!iso) return 'no-kickoff';
  const startsAt = new Date(iso);
  if (Number.isNaN(startsAt.getTime())) return 'no-kickoff';

  const homeScore = Number(raw.score?.regular?.home ?? raw.score?.total?.home);
  const awayScore = Number(raw.score?.regular?.away ?? raw.score?.total?.away);
  const phase = raw.competitionPhase ?? raw.round?.phase ?? raw.matchday?.phase ?? null;
  const venue =
    raw.stadium?.officialName?.trim() ||
    raw.stadium?.name?.trim() ||
    raw.stadium?.city?.translations?.name?.EN?.trim() ||
    undefined;

  return {
    id: `uefa:${raw.id}`,
    sport: 'football',
    competitionId,
    competitionName,
    homeTeam: home,
    awayTeam: away,
    startsAt,
    status: mapStatus(raw.status),
    score: {
      home: Number.isFinite(homeScore) ? homeScore : null,
      away: Number.isFinite(awayScore) ? awayScore : null,
    },
    venue,
    round: roundLabel(raw) ?? undefined,
    metadata: {
      season: seasonLabel,
      seasonYear: raw.seasonYear != null ? String(raw.seasonYear) : seasonLabel,
      phase,
      uefaMatchId: String(raw.id),
      uefaStatus: raw.status ?? null,
    },
    providerRef: { provider: PROVIDER, externalId: String(raw.id) },
  };
}

async function fetchPage(params: Record<string, string>): Promise<UefaMatch[]> {
  const qs = new URLSearchParams(params);
  const url = `${BASE}/matches?${qs.toString()}`;
  const data = await providerFetchJson<UefaMatch[]>({
    provider: PROVIDER,
    url,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  return Array.isArray(data) ? data : [];
}

function uefaPlayerName(player: unknown): string | undefined {
  if (!player || typeof player !== 'object') return undefined;
  const p = player as {
    internationalName?: string;
    translations?: { name?: { EN?: string }; shortName?: { EN?: string } };
  };
  return p.internationalName ?? p.translations?.name?.EN ?? p.translations?.shortName?.EN;
}

function uefaMinute(item: { time?: { minute?: number; injuryMinute?: number } }): number | undefined {
  const m = item.time?.minute;
  if (typeof m !== 'number' || !Number.isFinite(m)) return undefined;
  const inj = item.time?.injuryMinute;
  return m + (typeof inj === 'number' && Number.isFinite(inj) ? inj : 0);
}

function uefaSide(
  teamId: unknown,
  homeId?: string,
  awayId?: string,
): 'home' | 'away' {
  const id = teamId != null ? String(teamId) : '';
  if (id && awayId && id === String(awayId)) return 'away';
  if (id && homeId && id === String(homeId)) return 'home';
  return 'home';
}

type UefaEventItem = {
  teamId?: string | number;
  goalType?: string;
  penaltyType?: string;
  phase?: string;
  time?: { minute?: number; injuryMinute?: number };
  player?: unknown;
  playerIn?: unknown;
  playerOut?: unknown;
};

function mapUefaBucket(
  key: string,
  items: UefaEventItem[],
  matchId: string,
  homeId?: string,
  awayId?: string,
): NormalizedMatchEvent[] {
  const out: NormalizedMatchEvent[] = [];
  for (const item of items) {
    const name = uefaPlayerName(item.player) ?? uefaPlayerName(item.playerIn);
    const minute = uefaMinute(item);
    const team = uefaSide(item.teamId, homeId, awayId);
    const goalType = String(item.goalType ?? item.penaltyType ?? '').toUpperCase();
    const k = key.toLowerCase();

    if (k === 'scorers' || k === 'goals') {
      const isPen = goalType.includes('PENALTY');
      const isOwn = goalType.includes('OWN');
      out.push({
        matchId,
        minute,
        type: isPen ? 'penalty' : 'goal',
        team,
        playerName: name,
        detail: isOwn ? 'Own goal' : isPen ? 'Penalty' : undefined,
      });
    } else if (k === 'penaltyscorers' || k === 'penalties') {
      out.push({
        matchId,
        minute,
        type: 'penalty',
        team,
        playerName: name,
        detail: item.phase === 'PENALTY' ? 'Shootout' : 'Penalty',
      });
    } else if (k === 'penaltiesmissed' || k === 'missedpenalties') {
      out.push({
        matchId,
        minute,
        type: 'penalty',
        team,
        playerName: name,
        detail: 'Missed penalty',
      });
    } else if (k.includes('red') || k.includes('yellow') || k.includes('card')) {
      const card = k.includes('red') ? 'Red card' : k.includes('yellow') ? 'Yellow card' : 'Card';
      out.push({
        matchId,
        minute,
        type: 'card',
        team,
        playerName: name,
        detail: card,
      });
    } else if (k.includes('sub')) {
      const incoming = uefaPlayerName(item.playerIn) ?? name;
      const outgoing = uefaPlayerName(item.playerOut);
      out.push({
        matchId,
        minute,
        type: 'substitution',
        team,
        playerName: incoming,
        detail: outgoing ? `${incoming ?? '?'} replaces ${outgoing}` : undefined,
      });
    }
  }
  return out;
}

/** Map UEFA `playerEvents` (list or single-match payload) into MatchEvent rows. */
export function parseUefaPlayerEvents(
  match: {
    homeTeam?: { id?: string };
    awayTeam?: { id?: string };
    playerEvents?: Record<string, unknown> | unknown[] | null;
  },
  matchId: string,
  opts?: { homeTeamExternalId?: string; awayTeamExternalId?: string },
): NormalizedMatchEvent[] {
  const pe = match.playerEvents;
  if (!pe) return [];
  const homeId = opts?.homeTeamExternalId ?? match.homeTeam?.id;
  const awayId = opts?.awayTeamExternalId ?? match.awayTeam?.id;

  const buckets: Array<[string, UefaEventItem[]]> = [];
  if (Array.isArray(pe)) {
    buckets.push(['events', pe as UefaEventItem[]]);
  } else {
    for (const [key, value] of Object.entries(pe)) {
      if (Array.isArray(value)) buckets.push([key, value as UefaEventItem[]]);
    }
  }

  const out: NormalizedMatchEvent[] = [];
  for (const [key, items] of buckets) {
    out.push(...mapUefaBucket(key, items, matchId, homeId, awayId));
  }
  return out
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
    .slice(0, 200);
}

export class UEFAProvider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: PROVIDER,
    sports: ['football'],
    // Not registered on the sports router — UCL-only. Ingest jobs call this
    // class directly so we never shadow ESPN for domestic leagues.
    priority: 2,
  };

  async healthCheck(): Promise<boolean> {
    try {
      const rows = await fetchPage({
        competitionId: UEFA_COMPETITIONS.ucl.id,
        offset: '0',
        limit: '1',
      });
      return Array.isArray(rows);
    } catch {
      return false;
    }
  }

  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    if (opts.sport !== 'football') return [];
    const seasonYear = uefaSeasonYear();
    const result = await this.fetchCompetitionSeason('ucl', seasonYear);
    if (!opts.date) return result.matches;
    const day = opts.date.replace(/-/g, '');
    return result.matches.filter((m) => {
      const y = m.startsAt.getUTCFullYear();
      const mo = String(m.startsAt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(m.startsAt.getUTCDate()).padStart(2, '0');
      return `${y}${mo}${d}` === day;
    });
  }

  async fetchCompetitions(_sport: SportId): Promise<NormalizedCompetition[]> {
    const c = UEFA_COMPETITIONS.ucl;
    return [
      {
        id: `uefa:${c.id}`,
        name: c.name,
        sport: 'football',
        providerRef: { provider: PROVIDER, externalId: c.id },
      },
    ];
  }

  /**
   * Full-season pull for one UEFA competition. Paginates until a short page.
   */
  async fetchCompetitionSeason(
    key: UefaCompetitionKey,
    seasonYear: number,
  ): Promise<UefaFetchResult> {
    const meta = UEFA_COMPETITIONS[key];
    const seasonLabel = uefaSeasonLabel(seasonYear);
    const competitionId = `uefa:${meta.id}`;

    const raw: UefaMatch[] = [];
    const pageSize = 100;
    let offset = 0;
    while (offset <= 1_000) {
      const page = await fetchPage({
        competitionId: meta.id,
        seasonYear: String(seasonYear),
        offset: String(offset),
        limit: String(pageSize),
        utcOffset: '0',
        order: 'ASC',
      });
      raw.push(...page);
      if (page.length < pageSize) break;
      offset += page.length;
    }

    const matches: NormalizedMatch[] = [];
    const byPhase: Record<string, number> = {};
    let skippedPlaceholder = 0;
    let skippedNoKickoff = 0;
    let skippedUnnamed = 0;
    const now = Date.now();
    let upcoming = 0;

    for (const row of raw) {
      const mapped = toMatch(row, meta.name, competitionId, seasonLabel);
      if (mapped === 'placeholder') {
        skippedPlaceholder += 1;
        continue;
      }
      if (mapped === 'no-kickoff') {
        skippedNoKickoff += 1;
        continue;
      }
      if (mapped === 'unnamed') {
        skippedUnnamed += 1;
        continue;
      }
      const phase = String(mapped.metadata?.phase ?? 'unknown');
      byPhase[phase] = (byPhase[phase] ?? 0) + 1;
      if (mapped.startsAt.getTime() >= now && mapped.status !== 'completed') upcoming += 1;
      matches.push(mapped);
    }

    return {
      matches,
      fetched: raw.length,
      skippedPlaceholder,
      skippedNoKickoff,
      skippedUnnamed,
      byPhase,
      upcoming,
    };
  }

  async fetchMatchEvents(
    matchId: string,
    opts?: FetchMatchEventsOpts,
  ): Promise<NormalizedMatchEvent[]> {
    const externalId = matchId.replace(/^uefa:/i, '');
    try {
      const data = await providerFetchJson<UefaMatch | UefaMatch[]>({
        provider: PROVIDER,
        url: `${BASE}/matches/${externalId}`,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return [];
      return parseUefaPlayerEvents(row, matchId, {
        homeTeamExternalId: opts?.homeTeamExternalId ?? row.homeTeam?.id,
        awayTeamExternalId: opts?.awayTeamExternalId ?? row.awayTeam?.id,
      });
    } catch {
      return [];
    }
  }
}
