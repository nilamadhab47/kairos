/**
 * Smoke assertions for the display normalizer.
 *
 * These fixtures are copied from real provider payloads we've seen in
 * ingestion logs — Cricbuzz, ESPN, API-Football, OpenF1, SportAPI7.
 * If you're changing the normalizer, run:
 *
 *   pnpm --filter @kairo/core exec tsx src/normalize.test.ts
 */

import { strict as assert } from 'node:assert';
import { formatCompetitionDisplay, inferTeamType } from './normalize.js';

type Case = {
  raw: string;
  sport?: Parameters<typeof formatCompetitionDisplay>[1];
  expect: Partial<ReturnType<typeof formatCompetitionDisplay>>;
};

const CASES: Case[] = [
  // ── cricket ───────────────────────────────────────────────────────────────
  {
    raw: "The Hundred Women's Competition 2026",
    sport: 'cricket',
    expect: { displayName: 'The Hundred', gender: 'women', seasonLabel: '2026', format: 'franchise' },
  },
  {
    raw: "The Hundred Men's Competition 2026",
    sport: 'cricket',
    expect: { displayName: 'The Hundred', gender: 'men', seasonLabel: '2026', format: 'franchise' },
  },
  {
    raw: 'Indian Premier League 2026',
    sport: 'cricket',
    expect: { displayName: 'Indian Premier League', seasonLabel: '2026', format: 'franchise' },
  },
  {
    raw: "ICC Men's T20 World Cup 2024",
    sport: 'cricket',
    expect: { displayName: 'ICC T20 World Cup', gender: 'men', seasonLabel: '2024' },
  },
  {
    raw: 'India tour of Australia, 2024/25',
    sport: 'cricket',
    expect: { displayName: 'India tour of Australia', seasonLabel: '2024/25', format: 'international' },
  },
  // ── football ──────────────────────────────────────────────────────────────
  {
    raw: 'Premier League 2025/26',
    sport: 'football',
    expect: { displayName: 'Premier League', seasonLabel: '2025/26', format: 'league' },
  },
  {
    raw: 'La Liga 2025/2026',
    sport: 'football',
    expect: { displayName: 'La Liga', seasonLabel: '2025/2026', format: 'league' },
  },
  {
    raw: 'UEFA Champions League 2025/26',
    sport: 'football',
    expect: { displayName: 'UEFA Champions League', seasonLabel: '2025/26', format: 'league' },
  },
  {
    raw: 'FA Cup 2025/26',
    sport: 'football',
    expect: { displayName: 'FA Cup', seasonLabel: '2025/26', format: 'cup' },
  },
  // ── f1 ────────────────────────────────────────────────────────────────────
  {
    raw: 'Formula 1 2026',
    sport: 'f1',
    expect: { displayName: 'Formula 1', seasonLabel: '2026', format: 'championship' },
  },
  // ── tennis ────────────────────────────────────────────────────────────────
  {
    raw: 'Wimbledon 2026',
    sport: 'tennis',
    expect: { displayName: 'Wimbledon', seasonLabel: '2026', format: 'grand-slam' },
  },
  {
    raw: 'US Open 2026',
    sport: 'tennis',
    expect: { displayName: 'US Open', seasonLabel: '2026', format: 'grand-slam' },
  },
];

let passed = 0;
let failed = 0;
for (const c of CASES) {
  const got = formatCompetitionDisplay(c.raw, c.sport);
  try {
    for (const [k, v] of Object.entries(c.expect)) {
      assert.equal(
        got[k as keyof typeof got],
        v,
        `${c.raw} → expected ${k}=${JSON.stringify(v)} got ${JSON.stringify(got[k as keyof typeof got])}`,
      );
    }
    passed += 1;
    console.log(`  ok   ${c.raw}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${c.raw}`);
    console.log(`       ${(err as Error).message}`);
  }
}

// team type inference sanity
assert.equal(inferTeamType({ sport: 'f1', teamName: 'McLaren' }), 'constructor');
assert.equal(
  inferTeamType({ sport: 'cricket', teamName: 'India', competitionFormat: 'international' }),
  'national',
);
assert.equal(
  inferTeamType({ sport: 'cricket', teamName: 'Mumbai Indians', competitionFormat: 'franchise' }),
  'franchise',
);
assert.equal(
  inferTeamType({ sport: 'cricket', teamName: 'England' }),
  'national',
  'cricket: name-only heuristic should classify England as national',
);
assert.equal(
  inferTeamType({ sport: 'football', teamName: 'Barcelona' }),
  'club',
);
console.log('  ok   team type inferences');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
