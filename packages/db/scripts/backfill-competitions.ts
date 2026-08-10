/**
 * Backfill `Competition.displayName / gender / format / seasonLabel` and
 * `Team.type` for every existing row using the shared normalizer.
 *
 * Provider strings stay in `Competition.name` / `Team.name` — those are the
 * lookup keys and the audit trail. Only *derived* fields are written.
 *
 * Idempotent: if a row already has a curated `type` or `displayName`, we do
 * not overwrite it (rare today, but respected to keep manual fixes safe).
 *
 * Usage:
 *   pnpm --filter @kairo/db exec tsx scripts/backfill-competitions.ts
 *   pnpm --filter @kairo/db exec tsx scripts/backfill-competitions.ts --dry
 */

import {
  formatCompetitionDisplay,
  inferTeamType,
  type Sport as NormalizerSport,
} from '@kairo/core';
import { prisma } from '../src/index.js';

interface CountersC {
  scanned: number;
  updated: number;
  skipped: number;
}

interface CountersT {
  scanned: number;
  updated: number;
  skipped: number;
}

async function backfillCompetitions(dryRun: boolean): Promise<CountersC> {
  const rows = await prisma.competition.findMany({
    select: { id: true, sportId: true, name: true, displayName: true, gender: true, format: true, seasonLabel: true },
  });
  const counters: CountersC = { scanned: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    counters.scanned += 1;
    const d = formatCompetitionDisplay(row.name, row.sportId as NormalizerSport);
    // Never clobber a curated displayName. Fill blanks only.
    const nextDisplayName = row.displayName ?? d.displayName;
    const nextGender = row.gender ?? d.gender ?? null;
    const nextFormat = row.format ?? d.format ?? null;
    const nextSeasonLabel = row.seasonLabel ?? d.seasonLabel ?? null;

    const changed =
      nextDisplayName !== row.displayName ||
      nextGender !== row.gender ||
      nextFormat !== row.format ||
      nextSeasonLabel !== row.seasonLabel;

    if (!changed) {
      counters.skipped += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.competition.update({
        where: { id: row.id },
        data: {
          displayName: nextDisplayName,
          gender: nextGender,
          format: nextFormat,
          seasonLabel: nextSeasonLabel,
        },
      });
    }
    counters.updated += 1;
  }

  return counters;
}

async function backfillTeams(dryRun: boolean): Promise<CountersT> {
  // For team.type inference we need the format of *any* competition the team plays in.
  // Use the highest-signal competition (lowest tier = most senior). If no join
  // rows, fall back to team-name heuristics via inferTeamType.
  const rows = await prisma.team.findMany({
    select: {
      id: true,
      sportId: true,
      name: true,
      type: true,
      competitions: {
        select: {
          competition: { select: { format: true, tier: true } },
        },
      },
    },
  });
  const counters: CountersT = { scanned: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    counters.scanned += 1;
    if (row.type) {
      counters.skipped += 1;
      continue;
    }
    const senior = row.competitions
      .map((c) => c.competition)
      .sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1))[0];
    const inferred = inferTeamType({
      sport: row.sportId as NormalizerSport,
      teamName: row.name,
      competitionFormat: (senior?.format ?? undefined) as
        | Parameters<typeof inferTeamType>[0]['competitionFormat']
        | undefined,
    });
    if (!inferred) {
      counters.skipped += 1;
      continue;
    }
    if (!dryRun) {
      await prisma.team.update({ where: { id: row.id }, data: { type: inferred } });
    }
    counters.updated += 1;
  }

  return counters;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  if (dryRun) console.log('DRY RUN — no writes will happen.\n');

  console.log('Backfilling competitions…');
  const comps = await backfillCompetitions(dryRun);
  console.log(
    `  scanned=${comps.scanned}  updated=${comps.updated}  skipped=${comps.skipped}`,
  );

  console.log('Backfilling teams…');
  const teams = await backfillTeams(dryRun);
  console.log(
    `  scanned=${teams.scanned}  updated=${teams.updated}  skipped=${teams.skipped}`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
