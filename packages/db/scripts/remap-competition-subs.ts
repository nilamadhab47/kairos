/**
 * One-off / ops: remap competition subscriptions onto the canonical
 * season/provider clone (most teams + matches). Safe to re-run.
 *
 *   pnpm --filter @kairo/server exec tsx ../../packages/db/scripts/remap-competition-subs.ts
 */
import { prisma } from '../src/index';

function familyKey(c: {
  displayName: string | null;
  name: string;
  gender: string | null;
  format: string | null;
}): string {
  return `${(c.displayName ?? c.name).toLowerCase()}|${c.gender ?? ''}|${c.format ?? ''}`;
}

async function main() {
  const comps = await prisma.competition.findMany({
    select: {
      id: true,
      name: true,
      displayName: true,
      gender: true,
      format: true,
      season: true,
      logoUrl: true,
    },
  });
  const [teamCounts, matchCounts] = await Promise.all([
    prisma.teamCompetition.groupBy({ by: ['competitionId'], _count: { _all: true } }),
    prisma.match.groupBy({ by: ['competitionId'], _count: { _all: true } }),
  ]);
  const teams = new Map(teamCounts.map((r) => [r.competitionId, r._count._all]));
  const matches = new Map(matchCounts.map((r) => [r.competitionId, r._count._all]));
  const score = (c: (typeof comps)[number]) =>
    (teams.get(c.id) ?? 0) * 1_000_000 +
    (matches.get(c.id) ?? 0) * 100 +
    (c.season ? 50 : 0) +
    (c.logoUrl ? 10 : 0);

  const groups = new Map<string, typeof comps>();
  for (const c of comps) {
    const k = familyKey(c);
    const g = groups.get(k) ?? [];
    g.push(c);
    groups.set(k, g);
  }

  const remap = new Map<string, string>();
  for (const group of groups.values()) {
    group.sort((a, b) => score(b) - score(a));
    const best = group[0]!;
    for (const c of group) if (c.id !== best.id) remap.set(c.id, best.id);
  }

  let updated = 0;
  const subs = await prisma.userSubscription.findMany({
    where: { entityType: 'competition', isActive: true },
  });
  for (const s of subs) {
    const to = remap.get(s.entityId);
    if (!to) continue;
    const clash = await prisma.userSubscription.findFirst({
      where: { userId: s.userId, category: s.category, entityId: to },
    });
    if (clash) {
      await prisma.userSubscription.update({ where: { id: s.id }, data: { isActive: false } });
    } else {
      await prisma.userSubscription.update({ where: { id: s.id }, data: { entityId: to } });
    }
    updated += 1;
    // eslint-disable-next-line no-console
    console.log(`${s.entityName}: ${s.entityId} -> ${to}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Remapped ${updated} competition subscription(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
