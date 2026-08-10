/**
 * Backfill Formula 1 constructors.
 *
 * Background: the original OpenF1 adapter stuffed session names ("Practice 1",
 * "Qualifying", "Race") and circuit/city labels ("Zandvoort", "Melbourne")
 * into `Team` rows. That's semantically wrong — F1 sessions are not
 * head-to-head events, so a session has no home/away team.
 *
 * Source: TheSportsDB `search_all_teams.php?l=Formula%201` returns the full
 * constructor grid (10 teams) with badges + fanart + strCountry. This is real
 * provider data, no fabrication. OpenF1's `/drivers` endpoint requires a
 * `session_key` filter (not `year`) so we don't use it for the catalog pass.
 *
 * We keep a short curated alias map to turn provider long-forms
 * ("Scuderia Ferrari HP", "Oracle Red Bull Racing") into the punchy display
 * short-names the UI wants ("Ferrari", "Red Bull"). Provider long-form stays
 * in `Team.name` as the audit trail.
 *
 * This script also:
 *   · NULLs `home_team_id` / `away_team_id` on all F1 Match rows (sessions).
 *   · Deletes orphan F1 Team rows (the ~36 misclassified session/city labels).
 *
 * Usage:
 *   pnpm --filter @kairo/db exec tsx scripts/backfill-f1-constructors.ts --dry
 *   pnpm --filter @kairo/db exec tsx scripts/backfill-f1-constructors.ts
 */

import { TheSportsDBProvider } from '@kairo/sports';
import { prisma } from '../src/index.js';

/**
 * Curated short-name aliases for constructor long-forms as returned by
 * TheSportsDB. The full name is preserved in `Team.name`; this is only the
 * display short shown in tight UI slots.
 */
const SHORT_NAME_ALIASES: Record<string, string> = {
  'Oracle Red Bull Racing': 'Red Bull',
  'Scuderia Ferrari HP': 'Ferrari',
  'McLaren Formula 1 Team': 'McLaren',
  'Mercedes-AMG PETRONAS Formula One Team': 'Mercedes',
  'Aston Martin Aramco Formula One Team': 'Aston Martin',
  'BWT Alpine Formula One Team': 'Alpine',
  'MoneyGram Haas F1 Team': 'Haas',
  'Visa Cash App Racing Bulls Formula One Team': 'Racing Bulls',
  'Audi Revolut F1 Team': 'Audi',
  'Cadillac Formula 1 Team': 'Cadillac',
  'Kick Sauber F1 Team': 'Sauber',
  'Stake F1 Team Kick Sauber': 'Sauber',
  'Williams Racing': 'Williams',
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  if (dryRun) console.log('DRY RUN — no writes will happen.\n');

  const provider = new TheSportsDBProvider();
  console.log('Fetching F1 constructors from TheSportsDB…');
  const constructors = await provider.fetchF1Constructors();
  console.log(`  ${constructors.length} constructors returned`);
  for (const c of constructors) {
    const short = SHORT_NAME_ALIASES[c.name] ?? c.shortName ?? '(none)';
    const badge = c.badgeUrl ? '✓' : '✗';
    console.log(`    · ${c.name.padEnd(46)}  short=${short.padEnd(14)}  badge=${badge}`);
  }

  if (constructors.length === 0) {
    console.log('\nTheSportsDB returned zero constructors — aborting so we do not wipe existing F1 team FKs.');
    await prisma.$disconnect();
    process.exit(1);
  }

  let created = 0;
  let updated = 0;

  for (const c of constructors) {
    const shortName = SHORT_NAME_ALIASES[c.name] ?? c.shortName ?? null;
    const providerRef = { provider: 'thesportsdb', externalId: c.externalId };
    if (dryRun) continue;

    // Match by TheSportsDB provider ref first, then by exact name — never
    // create a duplicate row.
    const existingByRef = await prisma.team.findFirst({
      where: {
        sportId: 'f1',
        providerRefs: { array_contains: [providerRef] as unknown as object },
      },
    });
    const existing =
      existingByRef ??
      (await prisma.team.findFirst({ where: { sportId: 'f1', name: c.name } }));

    if (existing) {
      await prisma.team.update({
        where: { id: existing.id },
        data: {
          type: 'constructor',
          shortName: existing.shortName ?? shortName,
          logoUrl: existing.logoUrl ?? c.badgeUrl ?? c.logoUrl,
          country: existing.country ?? c.country,
          providerRefs: [providerRef] as unknown as object,
        },
      });
      updated += 1;
    } else {
      await prisma.team.create({
        data: {
          sportId: 'f1',
          name: c.name,
          shortName,
          type: 'constructor',
          logoUrl: c.badgeUrl ?? c.logoUrl,
          country: c.country,
          providerRefs: [providerRef] as unknown as object,
        },
      });
      created += 1;
    }

    // Persist the badge into the Asset table so future flows can pick it up.
    if (!dryRun && c.badgeUrl) {
      const teamRow = await prisma.team.findFirst({
        where: { sportId: 'f1', name: c.name },
        select: { id: true },
      });
      if (teamRow) {
        await prisma.asset
          .upsert({
            where: {
              entityType_entityId_assetType_provider: {
                entityType: 'team',
                entityId: teamRow.id,
                assetType: 'logo',
                provider: 'thesportsdb',
              },
            },
            update: { url: c.badgeUrl },
            create: {
              entityType: 'team',
              entityId: teamRow.id,
              assetType: 'logo',
              provider: 'thesportsdb',
              url: c.badgeUrl,
            },
          })
          .catch(() => undefined);
      }
    }
  }
  console.log(`\nConstructor Team rows: created=${created} updated=${updated}`);

  // NULL out home/away on existing F1 Match rows (they were session/circuit labels).
  const f1Matches = await prisma.match.findMany({
    where: {
      sportId: 'f1',
      OR: [{ homeTeamId: { not: null } }, { awayTeamId: { not: null } }],
    },
    select: { id: true },
  });
  console.log(`\nF1 matches with stale home/away FKs: ${f1Matches.length}`);
  if (!dryRun && f1Matches.length > 0) {
    await prisma.match.updateMany({
      where: { sportId: 'f1' },
      data: { homeTeamId: null, awayTeamId: null },
    });
    console.log('  cleared home/away FKs on all F1 matches');
  }

  // Delete orphan F1 Team rows (session/city labels no longer referenced).
  const realConstructorNames = new Set(constructors.map((c) => c.name.toLowerCase()));
  const allF1Teams = await prisma.team.findMany({
    where: { sportId: 'f1' },
    select: {
      id: true,
      name: true,
      _count: { select: { homeMatches: true, awayMatches: true, players: true } },
    },
  });
  const orphans = allF1Teams.filter((t) => {
    if (realConstructorNames.has(t.name.toLowerCase())) return false;
    return t._count.homeMatches === 0 && t._count.awayMatches === 0 && t._count.players === 0;
  });
  console.log(`\nOrphan F1 Team rows to delete: ${orphans.length}`);
  for (const o of orphans) console.log(`    · ${o.name}`);
  if (!dryRun && orphans.length > 0) {
    await prisma.teamCompetition.deleteMany({
      where: { teamId: { in: orphans.map((o) => o.id) } },
    });
    await prisma.team.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    console.log('  deleted');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
