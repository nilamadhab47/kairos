import { prisma } from '@kairo/db';

type ProviderRef = { provider: string; externalId: string };

type CompLite = {
  id: string;
  sportId: string;
  name: string;
  displayName: string | null;
  gender: string | null;
  format: string | null;
  season: string | null;
  seasonLabel: string | null;
  logoUrl: string | null;
  providerRefs: unknown;
};

function parseRefs(raw: unknown): ProviderRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is ProviderRef =>
      !!r &&
      typeof r === 'object' &&
      typeof (r as ProviderRef).provider === 'string' &&
      typeof (r as ProviderRef).externalId === 'string',
  );
}

function familyKey(c: {
  displayName: string | null;
  name: string;
  gender: string | null;
  format: string | null;
}): string {
  return `${(c.displayName ?? c.name).toLowerCase()}|${c.gender ?? ''}|${c.format ?? ''}`;
}

/**
 * Expand a competition id to every "same league" row (season / provider clones).
 * Catalog pickers and personalized feeds must use the family, not a single
 * brittle id — otherwise following a season=null La Liga clone yields 2 teams
 * and 0 matches while the 2026-27 clone has the full roster.
 */
export async function competitionFamilyIds(
  competitionIds: string | string[],
): Promise<string[]> {
  const seeds = [...new Set((Array.isArray(competitionIds) ? competitionIds : [competitionIds]).filter(Boolean))];
  if (seeds.length === 0) return [];

  const seedRows = await prisma.competition.findMany({
    where: { id: { in: seeds } },
    select: {
      id: true,
      sportId: true,
      name: true,
      displayName: true,
      gender: true,
      format: true,
      providerRefs: true,
    },
  });
  if (seedRows.length === 0) return seeds;

  const sportIds = [...new Set(seedRows.map((r) => r.sportId))];
  const peers = await prisma.competition.findMany({
    where: { sportId: { in: sportIds } },
    select: {
      id: true,
      sportId: true,
      name: true,
      displayName: true,
      gender: true,
      format: true,
      providerRefs: true,
    },
  });

  const keyToIds = new Map<string, Set<string>>();
  const refToIds = new Map<string, Set<string>>();
  for (const c of peers) {
    const k = `${c.sportId}|${familyKey(c)}`;
    if (!keyToIds.has(k)) keyToIds.set(k, new Set());
    keyToIds.get(k)!.add(c.id);
    for (const r of parseRefs(c.providerRefs)) {
      const rk = `${c.sportId}|${r.provider}|${r.externalId}`;
      if (!refToIds.has(rk)) refToIds.set(rk, new Set());
      refToIds.get(rk)!.add(c.id);
    }
  }

  const out = new Set<string>(seeds);
  for (const seed of seedRows) {
    const k = `${seed.sportId}|${familyKey(seed)}`;
    for (const id of keyToIds.get(k) ?? []) out.add(id);
    for (const r of parseRefs(seed.providerRefs)) {
      const rk = `${seed.sportId}|${r.provider}|${r.externalId}`;
      for (const id of refToIds.get(rk) ?? []) out.add(id);
    }
  }
  return [...out];
}

/**
 * Among competition clones that share a display key, prefer the row users
 * should follow: most team links, then has season, then has logo.
 */
export async function pickCanonicalCompetitions<
  T extends {
    id: string;
    displayName: string;
    name: string;
    gender: string | null;
    format: string | null;
    season: string | null;
    seasonLabel: string | null;
    logoUrl: string | null;
  },
>(rows: T[]): Promise<T[]> {
  if (rows.length <= 1) return rows;

  const groups = new Map<string, T[]>();
  for (const c of rows) {
    const key = familyKey(c);
    const g = groups.get(key) ?? [];
    g.push(c);
    groups.set(key, g);
  }

  const allIds = rows.map((r) => r.id);
  const [teamCounts, matchCounts] = await Promise.all([
    prisma.teamCompetition.groupBy({
      by: ['competitionId'],
      where: { competitionId: { in: allIds } },
      _count: { _all: true },
    }),
    prisma.match.groupBy({
      by: ['competitionId'],
      where: { competitionId: { in: allIds } },
      _count: { _all: true },
    }),
  ]);
  const teams = new Map(teamCounts.map((r) => [r.competitionId, r._count._all]));
  const matches = new Map(matchCounts.map((r) => [r.competitionId, r._count._all]));

  const score = (c: T) => {
    const t = teams.get(c.id) ?? 0;
    const m = matches.get(c.id) ?? 0;
    return (
      t * 1_000_000 +
      m * 100 +
      (c.season ? 50 : 0) +
      (c.logoUrl ? 10 : 0) +
      (c.seasonLabel ? 1 : 0)
    );
  };

  const winners: T[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => score(b) - score(a));
    winners.push(group[0]!);
  }
  return winners;
}

/** Map any competition id to the canonical family member (most teams/matches). */
export async function canonicalizeCompetitionIds(
  competitionIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(competitionIds.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  for (const id of unique) out.set(id, id);

  const seeds = await prisma.competition.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      sportId: true,
      name: true,
      displayName: true,
      gender: true,
      format: true,
      season: true,
      seasonLabel: true,
      logoUrl: true,
    },
  });
  if (seeds.length === 0) return out;

  const family = await competitionFamilyIds(unique);
  const peers = await prisma.competition.findMany({
    where: { id: { in: family } },
    select: {
      id: true,
      name: true,
      displayName: true,
      gender: true,
      format: true,
      season: true,
      seasonLabel: true,
      logoUrl: true,
    },
  });
  const shaped = peers.map((c) => ({
    ...c,
    displayName: c.displayName ?? c.name,
  }));
  const winners = await pickCanonicalCompetitions(shaped);
  const winnerByKey = new Map(winners.map((w) => [familyKey(w), w.id]));

  for (const seed of seeds) {
    const key = familyKey({
      displayName: seed.displayName,
      name: seed.name,
      gender: seed.gender,
      format: seed.format,
    });
    const best = winnerByKey.get(key);
    if (best) out.set(seed.id, best);
  }
  return out;
}

export type { CompLite };
