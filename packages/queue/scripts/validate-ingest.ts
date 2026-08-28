/**
 * Validation harness — runs each ingest job against REAL provider APIs and
 * prints the results plus DB counts. Not part of production paths.
 *
 * Usage:
 *   pnpm --filter @kairo/queue exec tsx scripts/validate-ingest.ts
 *
 * Env: reads .env from repo root (../../.env) via dotenv.
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv({ path: resolve(process.cwd(), '.env') });

import { prisma } from '@kairo/db';
import { initSportsProviders, sportsRouter } from '@kairo/sports';
import { ingestOpenF1Sessions } from '../src/jobs/ingest-f1.js';
import { ingestFootballFixtures } from '../src/jobs/ingest-football.js';
import { ingestUclCalendar } from '../src/jobs/ingest-ucl.js';
import { ingestCricketMatches } from '../src/jobs/ingest-cricket.js';
import { ingestTennisMatches } from '../src/jobs/ingest-tennis.js';

function fmt(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

async function stats(): Promise<Record<string, unknown>> {
  const [sports, competitions, teams, matches, standings, assets] = await Promise.all([
    prisma.sport.count(),
    prisma.competition.count(),
    prisma.team.count(),
    prisma.match.count(),
    prisma.standing.count(),
    prisma.asset.count(),
  ]);
  const upcoming = await prisma.match.groupBy({
    by: ['sportId'],
    _count: { _all: true },
    where: { startsAt: { gte: new Date() } },
  });
  const last = await prisma.match.findFirst({
    orderBy: { lastSyncedAt: 'desc' },
    select: { sportId: true, lastSyncedAt: true, competitionId: true },
  });
  return {
    counts: { sports, competitions, teams, matches, standings, assets },
    upcomingBySport: Object.fromEntries(upcoming.map((r) => [r.sportId, r._count._all])),
    lastMatch: last,
  };
}

async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
  const t = Date.now();
  console.log(`\n=== ${label} ===`);
  try {
    const r = await fn();
    console.log(`[${label}] ok in ${Date.now() - t}ms`);
    console.log(fmt(r));
  } catch (err) {
    console.error(`[${label}] FAILED after ${Date.now() - t}ms:`, err instanceof Error ? err.message : err);
  }
}

async function main(): Promise<void> {
  initSportsProviders();
  console.log('providers:', sportsRouter.listProviders().map((p) => `${p.name}(${p.sports.join(',')}, prio=${p.priority})`).join(', '));

  console.log('\n=== pre-ingest DB stats ===');
  console.log(fmt(await stats()));

  console.log('\n=== provider health probe ===');
  const probe = await sportsRouter.runHealthProbe();
  console.log(fmt(probe));

  await run('ingest:f1', () => ingestOpenF1Sessions());
  await run('ingest:cricket', () => ingestCricketMatches({ segment: 'all' }));
  await run('ingest:tennis', () => ingestTennisMatches({ daysAhead: 3 }));
  // Football full-season pull is heavy; scope to the two lightest curated leagues for validation.
  await run('ingest:football', () => ingestFootballFixtures({ monthsAhead: 3, skipUcl: true }));
  await run('ingest:ucl', () => ingestUclCalendar());

  console.log('\n=== post-ingest DB stats ===');
  console.log(fmt(await stats()));
}

main()
  .catch((err) => {
    console.error('validation failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
