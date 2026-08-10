/**
 * Enrich Team / Competition rows that are missing logoUrl via TheSportsDB.
 * Real provider artwork only — never invents badges.
 */

import { prisma } from '@kairo/db';
import {
  TheSportsDBProvider,
  THESPORTSDB_LICENSE_NOTE,
  normalizeLeagueKey,
  type CompetitionLogoSkipReason,
} from '@kairo/sports';

export type EnrichLogosJobData = {
  /** Max competitions to attempt this run (default 40). */
  competitionLimit?: number;
  /** Max teams to attempt this run (default 40). */
  teamLimit?: number;
  /** Prefer competitions/teams that have upcoming matches. */
  upcomingOnly?: boolean;
};

type TeamSkipReason =
  | 'unenrichable_name'
  | 'no_provider_match';

export type EnrichLogosResult = {
  competitionsUpdated: number;
  teamsUpdated: number;
  competitionsSkipped: number;
  teamsSkipped: number;
  competitionsAttempted: number;
  teamsAttempted: number;
  competitionSkipReasons: Record<CompetitionLogoSkipReason, number>;
  teamSkipReasons: Record<TeamSkipReason, number>;
  errors: string[];
  licenseNote: string;
};

const F1_SESSION_NAME =
  /^(practice|qualifying|sprint|race|day\s*\d|fp\d|session)/i;

function isEnrichableTeamName(name: string, sportId: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  // Sessions and city labels are not teams — legacy rows exist until the
  // F1 constructor backfill deletes them; guard against re-enriching them.
  if (sportId === 'f1' && F1_SESSION_NAME.test(trimmed)) return false;
  // Cricket shortcodes are not searchable strings on TheSportsDB. After the
  // cricket-teams backfill runs, remaining <=4-char single-token names are
  // still shortcodes we haven't translated — skip them so we don't burn quota.
  if (sportId === 'cricket' && trimmed.length <= 4 && !/\s/.test(trimmed)) {
    return false;
  }
  return true;
}

async function persistAsset(
  entityType: 'team' | 'competition',
  entityId: string,
  url: string,
): Promise<void> {
  await prisma.asset
    .upsert({
      where: {
        entityType_entityId_assetType_provider: {
          entityType,
          entityId,
          assetType: 'logo',
          provider: 'thesportsdb',
        },
      },
      update: { url },
      create: {
        entityType,
        entityId,
        assetType: 'logo',
        provider: 'thesportsdb',
        url,
      },
    })
    .catch(() => undefined);
}

export async function enrichLogosFromTheSportsDb(
  data: EnrichLogosJobData = {},
): Promise<EnrichLogosResult> {
  const competitionLimit = data.competitionLimit ?? 40;
  const teamLimit = data.teamLimit ?? 40;
  const upcomingOnly = data.upcomingOnly !== false;
  const provider = new TheSportsDBProvider();

  const result: EnrichLogosResult = {
    competitionsUpdated: 0,
    teamsUpdated: 0,
    competitionsSkipped: 0,
    teamsSkipped: 0,
    competitionsAttempted: 0,
    teamsAttempted: 0,
    competitionSkipReasons: {
      no_curated_id_no_country: 0,
      curated_id_no_badge: 0,
      country_search_no_match: 0,
      country_search_no_badge: 0,
    },
    teamSkipReasons: {
      unenrichable_name: 0,
      no_provider_match: 0,
    },
    errors: [],
    licenseNote: THESPORTSDB_LICENSE_NOTE,
  };

  const upcomingFilter = upcomingOnly
    ? { matches: { some: { startsAt: { gte: new Date() } } } }
    : {};

  // Deduplicate by normalized name so we don't burn quota on season clones
  const comps = await prisma.competition.findMany({
    where: {
      ...upcomingFilter,
      OR: [{ logoUrl: null }, { logoUrl: '' }],
      // Football + F1 use curated TheSportsDB ids; cricket franchise/international
      // and tennis Grand Slams match via country+name — allow those too.
      sportId: { in: ['football', 'f1', 'cricket', 'tennis'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: competitionLimit * 3,
    select: { id: true, name: true, displayName: true, sportId: true, country: true },
  });

  const seenCompKeys = new Set<string>();
  const compBatch: typeof comps = [];
  for (const c of comps) {
    // Prefer the normalized displayName for keys so season-duplicated rows
    // ("The Hundred 2026", "The Hundred 2027") collapse into one lookup.
    const lookup = c.displayName ?? c.name;
    const key = `${c.sportId}:${normalizeLeagueKey(lookup)}`;
    if (seenCompKeys.has(key)) continue;
    seenCompKeys.add(key);
    compBatch.push(c);
    if (compBatch.length >= competitionLimit) break;
  }

  const logoByKey = new Map<string, { logoUrl: string; externalId: string }>();
  const skipByKey = new Map<string, CompetitionLogoSkipReason>();

  for (const comp of compBatch) {
    const lookupName = comp.displayName ?? comp.name;
    const key = normalizeLeagueKey(lookupName);
    result.competitionsAttempted += 1;
    try {
      let hit = logoByKey.get(key) ?? null;
      let skipReason = skipByKey.get(key) ?? null;

      if (!hit && !skipReason) {
        const resolution = await provider.resolveCompetitionLogo(lookupName, comp.country);
        if (resolution.ok) {
          hit = { logoUrl: resolution.logoUrl, externalId: resolution.externalId };
          logoByKey.set(key, hit);
        } else {
          skipReason = resolution.reason;
          skipByKey.set(key, resolution.reason);
        }
      }

      if (!hit) {
        result.competitionsSkipped += 1;
        if (skipReason) result.competitionSkipReasons[skipReason] += 1;
        continue;
      }

      // Update all competitions sharing this normalized display key (season dupes).
      const siblings = await prisma.competition.findMany({
        where: {
          sportId: comp.sportId,
          OR: [{ logoUrl: null }, { logoUrl: '' }],
        },
        select: { id: true, name: true, displayName: true },
      });
      const ids = siblings
        .filter((s) => normalizeLeagueKey(s.displayName ?? s.name) === key)
        .map((s) => s.id);

      if (ids.length === 0) continue;

      await prisma.competition.updateMany({
        where: { id: { in: ids } },
        data: { logoUrl: hit.logoUrl },
      });
      for (const id of ids) {
        await persistAsset('competition', id, hit.logoUrl);
      }
      result.competitionsUpdated += ids.length;
    } catch (e) {
      result.errors.push(
        `competition ${comp.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const teams = await prisma.team.findMany({
    where: {
      // Explicit AND to keep the missing-logo filter separate from the sport filter.
      AND: [
        { OR: [{ logoUrl: null }, { logoUrl: '' }] },
        { sportId: { in: ['football', 'cricket', 'f1', 'tennis'] } },
        ...(upcomingOnly
          ? [{
              OR: [
                { homeMatches: { some: { startsAt: { gte: new Date() } } } },
                { awayMatches: { some: { startsAt: { gte: new Date() } } } },
                // Constructors (F1) don't have head-to-head matches — always
                // enrich them regardless of upcomingOnly.
                { type: 'constructor' },
              ],
            }]
          : []),
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: teamLimit * 2,
    select: { id: true, name: true, sportId: true },
  });

  let teamAttempts = 0;
  for (const team of teams) {
    if (teamAttempts >= teamLimit) break;
    if (!isEnrichableTeamName(team.name, team.sportId)) {
      result.teamsSkipped += 1;
      result.teamSkipReasons.unenrichable_name += 1;
      continue;
    }
    teamAttempts += 1;
    result.teamsAttempted += 1;
    try {
      const logoUrl = await provider.getTeamLogo(
        team.name,
        team.sportId as 'football' | 'cricket' | 'f1' | 'tennis',
      );
      if (!logoUrl) {
        result.teamsSkipped += 1;
        result.teamSkipReasons.no_provider_match += 1;
        continue;
      }
      await prisma.team.update({
        where: { id: team.id },
        data: { logoUrl },
      });
      await persistAsset('team', team.id, logoUrl);
      result.teamsUpdated += 1;
    } catch (e) {
      result.errors.push(
        `team ${team.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
