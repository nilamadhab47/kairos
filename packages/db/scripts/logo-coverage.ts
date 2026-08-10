/**
 * Logo coverage report.
 *
 * Reads the current DB and prints, per sport:
 *   - competition coverage % (has logo vs missing)
 *   - team coverage % broken down by inferred `type`
 *   - the top-N missing rows *weighted by upcoming matches* — that's what
 *     actually matters for the user's feed.
 *
 * Options:
 *   --json          print machine-readable JSON (for CI/dashboards later)
 *   --top=<n>       cap the missing lists per sport (default 25)
 *   --sport=<id>    filter to one sport
 *
 * Usage:
 *   pnpm --filter @kairo/db run report:logo-coverage
 *   pnpm --filter @kairo/db run report:logo-coverage -- --sport=cricket --top=50
 */

import { prisma } from '../src/index.js';

type Sport = 'football' | 'cricket' | 'f1' | 'tennis' | 'basketball' | 'baseball' | 'hockey';

interface MissingRow {
  id: string;
  name: string;
  displayName?: string | null;
  type?: string | null;
  upcomingMatches: number;
  totalMatches: number;
}

interface SportReport {
  sport: Sport;
  competitions: { total: number; withLogo: number; missing: MissingRow[] };
  teams: {
    total: number;
    withLogo: number;
    byType: Record<string, { total: number; withLogo: number }>;
    missing: MissingRow[];
  };
}

function pct(n: number, d: number): string {
  if (d === 0) return '  -  ';
  return `${((100 * n) / d).toFixed(1)}%`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function reportForSport(sport: Sport, top: number): Promise<SportReport> {
  const now = new Date();

  const comps = await prisma.competition.findMany({
    where: { sportId: sport },
    select: {
      id: true,
      name: true,
      displayName: true,
      logoUrl: true,
      _count: {
        select: {
          matches: { where: { startsAt: { gte: now } } },
        },
      },
    },
  });

  const compsWithLogo = comps.filter((c) => !!c.logoUrl).length;
  const compsMissing: MissingRow[] = [];
  for (const c of comps.filter((c) => !c.logoUrl)) {
    // Second query for total matches is expensive; we only care about upcoming for prioritization.
    compsMissing.push({
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      upcomingMatches: c._count.matches,
      totalMatches: 0,
    });
  }
  compsMissing.sort((a, b) => b.upcomingMatches - a.upcomingMatches);

  const teams = await prisma.team.findMany({
    where: { sportId: sport },
    select: {
      id: true,
      name: true,
      type: true,
      logoUrl: true,
      _count: {
        select: {
          homeMatches: { where: { startsAt: { gte: now } } },
          awayMatches: { where: { startsAt: { gte: now } } },
        },
      },
    },
  });

  const teamsWithLogo = teams.filter((t) => !!t.logoUrl).length;
  const byType: Record<string, { total: number; withLogo: number }> = {};
  for (const t of teams) {
    const k = t.type ?? 'unknown';
    if (!byType[k]) byType[k] = { total: 0, withLogo: 0 };
    byType[k].total += 1;
    if (t.logoUrl) byType[k].withLogo += 1;
  }

  const teamsMissing: MissingRow[] = teams
    .filter((t) => !t.logoUrl)
    .map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      upcomingMatches: t._count.homeMatches + t._count.awayMatches,
      totalMatches: 0,
    }))
    .sort((a, b) => b.upcomingMatches - a.upcomingMatches);

  return {
    sport,
    competitions: {
      total: comps.length,
      withLogo: compsWithLogo,
      missing: compsMissing.slice(0, top),
    },
    teams: {
      total: teams.length,
      withLogo: teamsWithLogo,
      byType,
      missing: teamsMissing.slice(0, top),
    },
  };
}

function printReport(reports: SportReport[]): void {
  console.log('\nLOGO COVERAGE REPORT');
  console.log('='.repeat(72));

  // Summary line
  console.log(
    `\n${pad('SPORT', 12)} ${pad('COMPS', 15)} ${pad('TEAMS', 15)}   TOP TEAM GAPS`,
  );
  console.log('-'.repeat(72));
  for (const r of reports) {
    const cLine = `${r.competitions.withLogo}/${r.competitions.total} (${pct(
      r.competitions.withLogo,
      r.competitions.total,
    )})`;
    const tLine = `${r.teams.withLogo}/${r.teams.total} (${pct(
      r.teams.withLogo,
      r.teams.total,
    )})`;
    const topGap = r.teams.missing[0]
      ? `${r.teams.missing[0].name} (+${r.teams.missing[0].upcomingMatches} matches)`
      : '—';
    console.log(`${pad(r.sport, 12)} ${pad(cLine, 15)} ${pad(tLine, 15)}   ${topGap}`);
  }

  for (const r of reports) {
    if (r.competitions.total === 0 && r.teams.total === 0) continue;
    console.log('\n' + '─'.repeat(72));
    console.log(`  ${r.sport.toUpperCase()}`);
    console.log('─'.repeat(72));

    console.log(
      `  Competitions: ${r.competitions.withLogo}/${r.competitions.total} have logos (${pct(
        r.competitions.withLogo,
        r.competitions.total,
      )})`,
    );
    if (r.competitions.missing.length > 0) {
      console.log(`  Top ${r.competitions.missing.length} missing (by upcoming matches):`);
      for (const c of r.competitions.missing) {
        const dn = c.displayName ?? c.name;
        console.log(
          `    · [${String(c.upcomingMatches).padStart(3)}]  ${pad(dn, 42)}  ${c.name === dn ? '' : `(raw: ${c.name})`}`,
        );
      }
    }

    console.log(`  Teams: ${r.teams.withLogo}/${r.teams.total} have logos (${pct(r.teams.withLogo, r.teams.total)})`);
    for (const [type, s] of Object.entries(r.teams.byType).sort()) {
      console.log(
        `    · ${pad(type, 12)}  ${s.withLogo}/${s.total}  (${pct(s.withLogo, s.total)})`,
      );
    }
    if (r.teams.missing.length > 0) {
      console.log(`  Top ${r.teams.missing.length} missing team logos (by upcoming matches):`);
      for (const t of r.teams.missing) {
        console.log(
          `    · [${String(t.upcomingMatches).padStart(3)}]  ${pad(t.name, 34)}  type=${t.type ?? 'unknown'}`,
        );
      }
    }
  }
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const topArg = args.find((a) => a.startsWith('--top='));
  const sportArg = args.find((a) => a.startsWith('--sport='));
  const top = topArg ? Math.max(1, parseInt(topArg.split('=')[1] ?? '25', 10)) : 25;
  const sportFilter = sportArg?.split('=')[1] as Sport | undefined;

  const ALL: Sport[] = ['football', 'cricket', 'f1', 'tennis', 'basketball', 'baseball', 'hockey'];
  const sports = sportFilter ? [sportFilter] : ALL;

  const reports: SportReport[] = [];
  for (const s of sports) {
    reports.push(await reportForSport(s, top));
  }

  if (json) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    printReport(reports);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
