/**
 * Normalized ingest writer.
 *
 * Ingest jobs call `upsertMatch(match)` for every `NormalizedMatch` returned
 * by a provider adapter. This module:
 *   - Ensures `Sport` row exists (must be seeded).
 *   - Upserts `Competition` and both `Team` records (by provider ref).
 *   - Upserts the `Match` row with provenance (source provider, ext id,
 *     last-synced timestamp).
 *   - Persists any team logo URL into the `Asset` table.
 *   - Mirrors the match into the legacy `Event` timeline table so existing
 *     `/api/events/today` and pre-event scheduler keep working.
 *
 * Data rule: only real provider data ever enters these tables. There is no
 * synthetic path. Callers must pass a fresh, validated `NormalizedMatch`.
 */

import { prisma } from '@kairo/db';
import { Prisma } from '@prisma/client';
import {
  formatCompetitionDisplay,
  inferTeamType,
  type CompetitionFormat,
  type Sport as NormalizerSport,
} from '@kairo/core';
import type { NormalizedMatch, NormalizedStandings, NormalizedMatchEvent, ProviderRef, SportId } from './types.js';

// ── Round sanitizer ────────────────────────────────────────────────
// Some providers (ESPN) accidentally put the match status into the `round`
// field ("Full Time", "Scheduled", "Halftime"). Strip those and prefer the
// existing DB value when the incoming one is garbage.
const STATUS_ROUND_STRINGS = new Set([
  'full time', 'scheduled', 'halftime', 'half time', 'postponed',
  'cancelled', 'canceled', 'abandoned', 'suspended', 'in progress',
  'after extra time', 'after penalties', 'ended', 'final',
]);

function sanitizeRound(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  if (incoming && STATUS_ROUND_STRINGS.has(incoming.toLowerCase().trim())) {
    return (existing as string) ?? null;
  }
  return incoming ?? (existing as string) ?? null;
}

// ── Global team-name canonicalization ──────────────────────────────
// Ensures all providers converge on a single name for the same club,
// preventing duplicate Team rows (e.g. "Internazionale" vs "Inter Milan").
const TEAM_CANONICAL: Record<string, string> = {
  internazionale: 'Inter Milan',
  inter: 'Inter Milan',
  'inter milan': 'Inter Milan',
  'fc internazionale milano': 'Inter Milan',
  milan: 'AC Milan',
  'ac milan': 'AC Milan',
  paris: 'Paris Saint-Germain',
  'paris saint-germain': 'Paris Saint-Germain',
  'paris saint germain': 'Paris Saint-Germain',
  psg: 'Paris Saint-Germain',
  'bayern münchen': 'Bayern Munich',
  'bayern munchen': 'Bayern Munich',
  'bayern munich': 'Bayern Munich',
  bayern: 'Bayern Munich',
  atleti: 'Atletico Madrid',
  'atlético': 'Atletico Madrid',
  'atlético madrid': 'Atletico Madrid',
  'atletico madrid': 'Atletico Madrid',
  'atletico de madrid': 'Atletico Madrid',
  'borussia dortmund': 'Borussia Dortmund',
  dortmund: 'Borussia Dortmund',
  roma: 'AS Roma',
  'as roma': 'AS Roma',
  porto: 'FC Porto',
  'fc porto': 'FC Porto',
  'manchester united': 'Manchester United',
  'man. united': 'Manchester United',
  'man united': 'Manchester United',
  'manchester city': 'Manchester City',
  'man. city': 'Manchester City',
  'man city': 'Manchester City',
  'club brugge kv': 'Club Brugge',
  'club brugge': 'Club Brugge',
  psv: 'PSV Eindhoven',
  'psv eindhoven': 'PSV Eindhoven',
  'sporting cp': 'Sporting CP',
  sporting: 'Sporting CP',
  'bodø/glimt': 'Bodo/Glimt',
  'bodo/glimt': 'Bodo/Glimt',
  'bodo glimt': 'Bodo/Glimt',
  'rb leipzig': 'RB Leipzig',
  leipzig: 'RB Leipzig',
  'shakhtar donetsk': 'Shakhtar Donetsk',
  shakhtar: 'Shakhtar Donetsk',
  'fenerbahçe': 'Fenerbahce',
  fenerbahce: 'Fenerbahce',
  // sportsrc / football-data.org variants
  'real madrid cf': 'Real Madrid',
  'real madrid c.f.': 'Real Madrid',
  'real madrid': 'Real Madrid',
  'fc barcelona': 'Barcelona',
  barcelona: 'Barcelona',
  'club atletico de madrid': 'Atletico Madrid',
  'sevilla fc': 'Sevilla',
  sevilla: 'Sevilla',
  'valencia cf': 'Valencia',
  valencia: 'Valencia',
  'villarreal cf': 'Villarreal',
  villarreal: 'Villarreal',
  'athletic club': 'Athletic Bilbao',
  'athletic bilbao': 'Athletic Bilbao',
  'real sociedad de futbol': 'Real Sociedad',
  'real sociedad': 'Real Sociedad',
  'real betis balompie': 'Real Betis',
  'real betis': 'Real Betis',
  'deportivo alaves': 'Deportivo Alaves',
  'ca osasuna': 'Osasuna',
  osasuna: 'Osasuna',
  'rc celta de vigo': 'Celta Vigo',
  'celta vigo': 'Celta Vigo',
  'levante ud': 'Levante',
  'girona fc': 'Girona',
  'getafe cf': 'Getafe',
  'rcd espanyol de barcelona': 'Espanyol',
  'rcd mallorca': 'Mallorca',
  'ud las palmas': 'Las Palmas',
  'rayo vallecano de madrid': 'Rayo Vallecano',
  'rcd deportivo la coruna': 'Deportivo La Coruna',
  'real racing club de santander': 'Racing Santander',
  'elche cf': 'Elche',
  // Serie A variants
  'ss lazio': 'Lazio',
  'ssc napoli': 'Napoli',
  'juventus fc': 'Juventus',
  'atalanta bc': 'Atalanta',
  'bologna fc 1909': 'Bologna',
  'acf fiorentina': 'Fiorentina',
  'genoa cfc': 'Genoa',
  'torino fc': 'Torino',
  'udinese calcio': 'Udinese',
  'us sassuolo calcio': 'Sassuolo',
  'us lecce': 'Lecce',
  'como 1907': 'Como',
  'parma calcio 1913': 'Parma',
  'hellas verona fc': 'Hellas Verona',
  'cagliari calcio': 'Cagliari',
  'us cremonese': 'Cremonese',
  'pisa sc': 'Pisa',
  // Bundesliga variants
  'fc bayern munchen': 'Bayern Munich',
  'bayer 04 leverkusen': 'Bayer Leverkusen',
  'bayer leverkusen': 'Bayer Leverkusen',
  'vfb stuttgart': 'Stuttgart',
  'eintracht frankfurt': 'Eintracht Frankfurt',
  'sv werder bremen': 'Werder Bremen',
  'werder bremen': 'Werder Bremen',
  'vfl wolfsburg': 'Wolfsburg',
  'borussia monchengladbach': 'Borussia Monchengladbach',
  'borussia mönchengladbach': 'Borussia Monchengladbach',
  '1.fc union berlin': 'Union Berlin',
  '1.fsv mainz 05': 'Mainz',
  '1.fc heidenheim 1846': 'Heidenheim',
  '1.fc koln': 'FC Koln',
  '1.fc köln': 'FC Koln',
  'sc freiburg': 'Freiburg',
  'tsg 1899 hoffenheim': 'Hoffenheim',
  'fc st. pauli 1910': 'St. Pauli',
  'fc augsburg': 'Augsburg',
  'hamburger sv': 'Hamburg',
  // Ligue 1 variants
  'olympique de marseille': 'Marseille',
  'olympique marseille': 'Marseille',
  'olympique lyonnais': 'Lyon',
  'as monaco fc': 'Monaco',
  'as monaco': 'Monaco',
  'lille osc': 'Lille',
  'stade rennais fc 1901': 'Rennes',
  'ogc nice': 'Nice',
  'rc strasbourg alsace': 'Strasbourg',
  'rc lens': 'Lens',
  'fc nantes': 'Nantes',
  'toulouse fc': 'Toulouse',
  'stade brestois 29': 'Brest',
  'angers sco': 'Angers',
  'le havre ac': 'Le Havre',
  'auxerre': 'Auxerre',
  'aj auxerre': 'Auxerre',
  'fc metz': 'Metz',
  'paris fc': 'Paris FC',
  // Premier League variants
  'arsenal fc': 'Arsenal',
  'chelsea fc': 'Chelsea',
  'liverpool fc': 'Liverpool',
  'tottenham hotspur fc': 'Tottenham',
  tottenham: 'Tottenham',
  'manchester united fc': 'Manchester United',
  'manchester city fc': 'Manchester City',
  'newcastle united fc': 'Newcastle',
  'aston villa fc': 'Aston Villa',
  'west ham united fc': 'West Ham',
  'brighton & hove albion fc': 'Brighton',
  'crystal palace fc': 'Crystal Palace',
  'nottingham forest fc': 'Nottingham Forest',
  'brentford fc': 'Brentford',
  'fulham fc': 'Fulham',
  'wolverhampton wanderers fc': 'Wolves',
  wolves: 'Wolves',
  'afc bournemouth': 'Bournemouth',
  'everton fc': 'Everton',
  'leeds united fc': 'Leeds',
  'burnley fc': 'Burnley',
  'sunderland afc': 'Sunderland',
};

function canonicalTeamName(name: string): string {
  const key = name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return TEAM_CANONICAL[key] ?? name;
}

function buildEventMetadata(
  matchId: string,
  competitionId: string,
  match: NormalizedMatch,
): Record<string, unknown> {
  return {
    matchId,
    competitionId,
    homeTeam: match.homeTeam ? { ...match.homeTeam } : null,
    awayTeam: match.awayTeam ? { ...match.awayTeam } : null,
    score: match.score ?? null,
    venue: match.venue ?? null,
    round: match.round ?? null,
    provider: match.providerRef.provider,
    providerExternalId: match.providerRef.externalId,
    providerFetchedAt: new Date().toISOString(),
  };
}

export interface UpsertMatchResult {
  matchId: string;
  eventId: string;
  competitionId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  action: 'created' | 'updated';
}

function mergeProviderRefs(existing: unknown, incoming: ProviderRef): ProviderRef[] {
  const list: ProviderRef[] = Array.isArray(existing)
    ? (existing as unknown as ProviderRef[])
    : [];
  const idx = list.findIndex((r) => r.provider === incoming.provider);
  if (idx >= 0) {
    list[idx] = incoming;
  } else {
    list.push(incoming);
  }
  return list;
}

async function ensureSport(sportId: SportId): Promise<void> {
  const sport = await prisma.sport.findUnique({ where: { id: sportId } });
  if (!sport) {
    throw new Error(
      `Sport row missing for '${sportId}'. Run: pnpm --filter @kairo/db seed:sports`,
    );
  }
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length <= max ? s : s.slice(0, max);
}

function competitionExternalId(match: NormalizedMatch): string {
  // e.g. espn:eng.1 → eng.1 ; sportapi7:tournament:17 → tournament:17
  const parts = match.competitionId.split(':');
  return parts.length > 1 ? parts.slice(1).join(':') : match.competitionId;
}

const competitionIdCache = new Map<string, { id: string; format: CompetitionFormat | null }>();

async function upsertCompetition(
  match: NormalizedMatch,
): Promise<{ id: string; format: CompetitionFormat | null }> {
  const externalId = competitionExternalId(match);
  const provider = match.providerRef.provider;
  const cacheKey = `${match.sport}|${provider}|${externalId}`;
  const cached = competitionIdCache.get(cacheKey);
  if (cached) return cached;

  const seasonRaw =
    typeof match.metadata?.season === 'string' || typeof match.metadata?.season === 'number'
      ? String(match.metadata.season)
      : null;
  const season = truncate(
    seasonRaw?.match(/\d{4}\s*[-/]\s*\d{2,4}/)?.[0]?.replace(/\s/g, '') ??
      seasonRaw?.match(/\d{4}/)?.[0] ??
      seasonRaw,
    20,
  );

  const name = truncate(match.competitionName, 255) ?? 'Unknown';

  const rows = await prisma.competition.findMany({
    where: { sportId: match.sport },
    select: { id: true, name: true, providerRefs: true, season: true },
  });

  // Prefer exact unique key (sport, name, season) when we know the season —
  // this is what @@unique enforces and avoids cloning La Liga forever.
  const byUnique =
    season != null
      ? rows.find((c) => c.name === name && c.season === season)
      : undefined;

  const byRefExactSeason = rows.find((c) => {
    if (season != null && c.season !== season && c.season != null) return false;
    const refs = Array.isArray(c.providerRefs)
      ? (c.providerRefs as unknown as ProviderRef[])
      : [];
    return refs.some((r) => r.provider === provider && r.externalId === externalId);
  });

  const byRefAny = rows.find((c) => {
    const refs = Array.isArray(c.providerRefs)
      ? (c.providerRefs as unknown as ProviderRef[])
      : [];
    return refs.some((r) => r.provider === provider && r.externalId === externalId);
  });

  // Prefer: exact season+name → same season via provider ref → any provider
  // ref → name match with same/null season → bare name.
  const hit =
    byUnique ??
    byRefExactSeason ??
    (season
      ? rows.find((c) => c.name === name && (c.season === season || c.season == null))
      : undefined) ??
    byRefAny ??
    rows.find((c) => c.name === name);

  const display = formatCompetitionDisplay(
    match.competitionName ?? '',
    match.sport as NormalizerSport,
  );

  if (hit) {
    // If we'd stamp season onto a null-season row but another row already
    // owns (sport, name, season), merge into that seasonal row instead of
    // throwing Unique constraint failed.
    let target = hit;
    if (season && !hit.season) {
      const conflict = rows.find((c) => c.name === hit.name && c.season === season);
      if (conflict && conflict.id !== hit.id) {
        target = conflict;
      }
    }

    const nextRefs = mergeProviderRefs(target.providerRefs, { provider, externalId });
    try {
      await prisma.competition.update({
        where: { id: target.id },
        data: {
          providerRefs: nextRefs as unknown as object,
          ...(season && !target.season ? { season } : {}),
          displayName: display.displayName,
          gender: display.gender ?? null,
          format: display.format ?? null,
          seasonLabel: display.seasonLabel ?? null,
        },
      });
    } catch {
      // Unique collision on season stamp — keep the row without mutating season.
      await prisma.competition.update({
        where: { id: target.id },
        data: {
          providerRefs: nextRefs as unknown as object,
          displayName: display.displayName,
          gender: display.gender ?? null,
          format: display.format ?? null,
          seasonLabel: display.seasonLabel ?? null,
        },
      });
    }
    const entry = { id: target.id, format: (display.format ?? null) as CompetitionFormat | null };
    competitionIdCache.set(cacheKey, entry);
    return entry;
  }

  try {
    const created = await prisma.competition.create({
      data: {
        sportId: match.sport,
        name,
        displayName: truncate(display.displayName, 255),
        gender: display.gender ?? null,
        format: display.format ?? null,
        seasonLabel: display.seasonLabel ?? null,
        season,
        providerRefs: [{ provider, externalId }] as unknown as object,
      },
    });
    const entry = {
      id: created.id,
      format: (display.format ?? null) as CompetitionFormat | null,
    };
    competitionIdCache.set(cacheKey, entry);
    return entry;
  } catch {
    const again = await prisma.competition.findFirst({
      where: {
        sportId: match.sport,
        name,
        ...(season != null ? { season } : {}),
      },
    });
    if (again) {
      const nextRefs = mergeProviderRefs(again.providerRefs, { provider, externalId });
      await prisma.competition.update({
        where: { id: again.id },
        data: { providerRefs: nextRefs as unknown as object },
      });
      const entry = {
        id: again.id,
        format: (display.format ?? null) as CompetitionFormat | null,
      };
      competitionIdCache.set(cacheKey, entry);
      return entry;
    }
    throw new Error(
      `failed to upsert competition ${match.competitionName} (${provider}:${externalId})`,
    );
  }
}

async function upsertTeam(
  sport: SportId,
  team: { id: string; name: string; shortName?: string; logoUrl?: string } | undefined,
  competitionId: string,
  provider: string,
  competitionFormat: CompetitionFormat | null,
): Promise<string | null> {
  if (!team?.name) return null;

  // Canonicalize the name so different providers converge on one Team row.
  const normalizedName = canonicalTeamName(team.name);

  const externalRefId = team.id.split(':').slice(2).join(':') || team.id;
  const providerRef: ProviderRef = { provider, externalId: externalRefId };

  const existingByRef = await prisma.team.findFirst({
    where: {
      sportId: sport,
      providerRefs: { array_contains: [providerRef] as any },
    },
  });
  const existing =
    existingByRef ??
    (await prisma.team.findFirst({
      where: { sportId: sport, name: normalizedName },
    }));
  const inferredType = inferTeamType({
    sport: sport as NormalizerSport,
    teamName: normalizedName,
    competitionFormat: competitionFormat ?? undefined,
  });

  if (existing) {
    const nextRefs = mergeProviderRefs(existing.providerRefs, providerRef);
    const updated = await prisma.team.update({
      where: { id: existing.id },
      data: {
        providerRefs: nextRefs as unknown as object,
        logoUrl: team.logoUrl ?? existing.logoUrl,
        // Only set `shortName` / `type` when we can improve on what's stored.
        ...(team.shortName && !existing.shortName ? { shortName: team.shortName } : {}),
        ...(inferredType && !existing.type ? { type: inferredType } : {}),
      },
    });
    await prisma.teamCompetition
      .upsert({
        where: { teamId_competitionId: { teamId: updated.id, competitionId } },
        update: {},
        create: { teamId: updated.id, competitionId },
      })
      .catch(() => undefined);
    if (team.logoUrl) await persistAsset('team', updated.id, 'logo', team.logoUrl, provider);
    return updated.id;
  }

  const created = await prisma.team.create({
    data: {
      sportId: sport,
      name: normalizedName,
      shortName: team.shortName ?? null,
      logoUrl: team.logoUrl,
      type: inferredType ?? null,
      providerRefs: [providerRef] as unknown as object,
    },
  });
  await prisma.teamCompetition
    .upsert({
      where: { teamId_competitionId: { teamId: created.id, competitionId } },
      update: {},
      create: { teamId: created.id, competitionId },
    })
    .catch(() => undefined);
  if (team.logoUrl) await persistAsset('team', created.id, 'logo', team.logoUrl, provider);
  return created.id;
}

async function persistAsset(
  entityType: 'team' | 'competition' | 'player' | 'sport',
  entityId: string,
  assetType: 'logo' | 'badge' | 'fanart' | 'banner' | 'icon',
  url: string,
  provider: string,
): Promise<void> {
  await prisma.asset
    .upsert({
      where: {
        entityType_entityId_assetType_provider: {
          entityType,
          entityId,
          assetType,
          provider,
        },
      },
      update: { url },
      create: { entityType, entityId, assetType, provider, url },
    })
    .catch(() => undefined);
}

/**
 * Upsert a normalized match into the sports domain (Match) and mirror it
 * into the legacy `Event` timeline. Idempotent by (sport, competition, teams, startsAt).
 */
export async function upsertMatch(match: NormalizedMatch): Promise<UpsertMatchResult> {
  if (!(match.startsAt instanceof Date) || Number.isNaN(match.startsAt.getTime())) {
    throw new Error(
      `invalid startsAt for match ${match.providerRef.provider}:${match.providerRef.externalId}`,
    );
  }
  await ensureSport(match.sport);

  const { id: competitionId, format: competitionFormat } = await upsertCompetition(match);
  const homeTeamId = await upsertTeam(
    match.sport,
    match.homeTeam,
    competitionId,
    match.providerRef.provider,
    competitionFormat,
  );
  const awayTeamId = await upsertTeam(
    match.sport,
    match.awayTeam,
    competitionId,
    match.providerRef.provider,
    competitionFormat,
  );

  const providerRefs = [match.providerRef];

  // Look up existing match — first by exact provider ref (fastest, safest);
  // fall back to (sport, competition, teams, startsAt) to catch cross-provider dupes.
  const existingByRef = await prisma.match.findFirst({
    where: {
      sportId: match.sport,
      providerRefs: { array_contains: [match.providerRef] as any },
    },
  });

  const existing =
    existingByRef ??
    (await prisma.match.findFirst({
      where: {
        sportId: match.sport,
        competitionId,
        homeTeamId,
        awayTeamId,
        startsAt: match.startsAt,
      },
    }));

  const baseData = {
    sportId: match.sport,
    competitionId,
    homeTeamId,
    awayTeamId,
    startsAt: match.startsAt,
    status: match.status,
    homeScore: match.score?.home ?? null,
    awayScore: match.score?.away ?? null,
    venue: match.venue,
    round: sanitizeRound(match.round, existing?.round),
    metadata: (match.metadata ?? {}) as object,
    lastSyncedAt: new Date(),
  };

  let matchRow;
  let action: 'created' | 'updated';
  if (existing) {
    const nextRefs = mergeProviderRefs(existing.providerRefs, match.providerRef);
    matchRow = await prisma.match.update({
      where: { id: existing.id },
      data: { ...baseData, providerRefs: nextRefs as unknown as object },
    });
    action = 'updated';
  } else {
    matchRow = await prisma.match.create({
      data: { ...baseData, providerRefs: providerRefs as unknown as object },
    });
    action = 'created';
  }

  // Mirror into legacy `events` timeline table (kept during migration).
  const eventTitle =
    match.homeTeam?.name && match.awayTeam?.name
      ? `${match.homeTeam.name} vs ${match.awayTeam.name}`
      : match.round
      ? `${match.competitionName} · ${match.round}`
      : match.competitionName;
  const eventSubtitle = match.round
    ? `${match.competitionName} · ${match.round}`
    : match.competitionName;

  const eventContextTags = [
    match.sport,
    `competition:${competitionId}`,
    homeTeamId ? `team:${homeTeamId}` : null,
    awayTeamId ? `team:${awayTeamId}` : null,
    `provider:${match.providerRef.provider}`,
  ].filter(Boolean) as string[];

  const eventStatus =
    match.status === 'scheduled' ? 'upcoming' : match.status;

  const eventRow = await prisma.event.upsert({
    where: {
      source_sourceEventId: {
        source: match.providerRef.provider,
        sourceEventId: match.providerRef.externalId,
      },
    },
    update: {
      category: match.sport,
      title: eventTitle,
      subtitle: eventSubtitle,
      startsAt: match.startsAt,
      status: eventStatus,
      metadata: buildEventMetadata(matchRow.id, competitionId, match) as object,
      contextTags: eventContextTags,
    },
    create: {
      source: match.providerRef.provider,
      category: match.sport,
      sourceEventId: match.providerRef.externalId,
      title: eventTitle,
      subtitle: eventSubtitle,
      startsAt: match.startsAt,
      status: eventStatus,
      metadata: buildEventMetadata(matchRow.id, competitionId, match) as object,
      contextTags: eventContextTags,
    },
  });

  return {
    matchId: matchRow.id,
    eventId: eventRow.id,
    competitionId,
    homeTeamId,
    awayTeamId,
    action,
  };
}

export interface UpsertBatchResult {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ providerExternalId?: string; message: string }>;
}

/** Convenience: apply upsertMatch across an array with per-item error isolation. */
export async function upsertMatches(matches: NormalizedMatch[]): Promise<UpsertBatchResult> {
  const result: UpsertBatchResult = { processed: 0, created: 0, updated: 0, skipped: 0, errors: [] };
  for (const m of matches) {
    result.processed += 1;
    if (!m || !m.startsAt) {
      result.skipped += 1;
      result.errors.push({ providerExternalId: m?.providerRef?.externalId, message: 'missing required fields' });
      continue;
    }
    // Head-to-head sports must have both teams. Solo/session sports (F1) may
    // legitimately omit both — but never exactly one.
    const hasHome = !!m.homeTeam?.name;
    const hasAway = !!m.awayTeam?.name;
    if (hasHome !== hasAway) {
      result.skipped += 1;
      result.errors.push({
        providerExternalId: m?.providerRef?.externalId,
        message: 'partial teams (exactly one of home/away present)',
      });
      continue;
    }
    try {
      const r = await upsertMatch(m);
      if (r.action === 'created') result.created += 1;
      else result.updated += 1;
    } catch (err) {
      result.errors.push({
        providerExternalId: m.providerRef?.externalId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

/** Persist a normalized standings snapshot for a competition/season. */
export async function upsertStandings(
  competitionId: string,
  season: string,
  standings: NormalizedStandings,
): Promise<{ rows: number }> {
  const standing = await prisma.standing.upsert({
    where: { competitionId_season: { competitionId, season } },
    update: { lastSyncedAt: new Date() },
    create: { competitionId, season },
  });

  // Look up competition once for sport + format so we can auto-create teams
  // that appear in the standings feed but aren't in the DB yet.
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { sportId: true, format: true },
  });

  await prisma.standingRow.deleteMany({ where: { standingId: standing.id } });

  let inserted = 0;
  for (const row of standings.rows) {
    const canonicalName = canonicalTeamName(row.teamName);
    const externalTeamId = row.teamId.includes(':')
      ? row.teamId.split(':').pop()!
      : row.teamId;

    let team =
      (await prisma.team.findFirst({
        where: {
          competitions: { some: { competitionId } },
          name: canonicalName,
        },
      })) ??
      (await prisma.team.findFirst({
        where: {
          ...(competition ? { sportId: competition.sportId } : {}),
          name: canonicalName,
        },
      }));

    // Try provider-ref match when name lookup misses (teams already ingested under this provider).
    if (!team) {
      const candidates = await prisma.team.findMany({
        where: { competitions: { some: { competitionId } } },
        take: 500,
      });
      team =
        candidates.find((t) => {
          const refs = Array.isArray(t.providerRefs)
            ? (t.providerRefs as unknown as ProviderRef[])
            : [];
          return refs.some(
            (r) =>
              r.provider === standings.providerRef.provider &&
              (r.externalId === externalTeamId || r.externalId === row.teamId),
          );
        }) ?? null;
    }

    // Auto-create the team from the standings feed if we still don't have
    // a match. Standings are the authoritative roster for a league — every
    // team appearing here belongs in the DB.
    if (!team && competition) {
      const createdId = await upsertTeam(
        competition.sportId as SportId,
        {
          id: row.teamId,
          name: row.teamName,
          logoUrl: row.teamLogoUrl ?? undefined,
        },
        competitionId,
        standings.providerRef.provider,
        (competition.format as CompetitionFormat | null) ?? null,
      );
      if (createdId) {
        team = await prisma.team.findUnique({ where: { id: createdId } });
      }
    }

    if (!team) continue;
    // Skip duplicate (standing_id + team_id) rows silently — this happens
    // when the canonicalizer collapses two feed rows onto the same DB team.
    // The first one wins; the alternate name variant is ignored.
    try {
      await prisma.standingRow.create({
        data: {
          standingId: standing.id,
          teamId: team.id,
          position: row.position,
          played: row.played,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          points: row.points,
          form: row.form ?? null,
        },
      });
      inserted += 1;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        continue;
      }
      throw err;
    }
  }
  return { rows: inserted };
}

/** Resolve a DB competition id from a provider external league id. */
export async function findCompetitionIdByProvider(
  provider: string,
  externalId: string,
  sportId?: string,
): Promise<string | null> {
  const rows = await prisma.competition.findMany({
    where: sportId ? { sportId } : undefined,
    select: { id: true, providerRefs: true },
  });
  for (const row of rows) {
    const refs = Array.isArray(row.providerRefs)
      ? (row.providerRefs as unknown as ProviderRef[])
      : [];
    if (refs.some((r) => r.provider === provider && r.externalId === externalId)) {
      return row.id;
    }
  }
  return null;
}

/** Replace persisted match events for a match. Empty list is a no-op (don't wipe on a failed fetch). */
export async function replaceMatchEvents(
  matchId: string,
  events: NormalizedMatchEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  await prisma.matchEvent.deleteMany({ where: { matchId } });
  await prisma.matchEvent.createMany({
    data: events.map((e) => ({
      matchId,
      minute: e.minute ?? null,
      type: e.type,
      team: e.team,
      playerName: truncate(e.playerName, 255),
      detail: e.detail ?? null,
    })),
  });
  return events.length;
}
