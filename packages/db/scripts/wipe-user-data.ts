/**
 * Wipe all user-side data for a from-scratch test.
 *
 * KEEPS: sports, competitions, teams, players, matches, match_events,
 *        standings, standing_rows, assets, team_competitions
 * CLEARS: users, sessions, accounts, verifications, user_devices,
 *         user_subscriptions, user_events, notifications,
 *         notification_preferences, habits, habit_completions,
 *         connected_sources, ai_copy_cache, events
 *
 * Guarded by NODE_ENV — refuses to run in production without --force.
 *
 * Usage:
 *   pnpm --filter @kairo/server exec tsx ../../packages/db/scripts/wipe-user-data.ts
 *   pnpm --filter @kairo/server exec tsx ../../packages/db/scripts/wipe-user-data.ts --force
 */

import { prisma } from '../src/index.js';

const USER_TABLES = [
  // Delete in dependency-safe order first — TRUNCATE ... CASCADE handles it
  // anyway, but listing them lets us print row counts before/after.
  'ai_copy_cache',
  'notifications',
  'notification_preferences',
  'user_events',
  'user_subscriptions',
  'user_devices',
  'habit_completions',
  'habits',
  'connected_sources',
  'session',
  'account',
  'verification',
  'events',
  'user',
];

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  if (process.env.NODE_ENV === 'production' && !force) {
    console.error('[wipe] NODE_ENV=production — refusing without --force');
    process.exit(1);
  }

  console.log('[wipe] BEFORE counts:');
  const before: Record<string, number> = {};
  for (const t of USER_TABLES) {
    const rows = (await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "${t}"`,
    ));
    before[t] = Number(rows[0]?.count ?? 0n);
    console.log(`  ${t.padEnd(28)} ${before[t]}`);
  }

  console.log('\n[wipe] truncating…');
  // Single statement — CASCADE handles FK deletes; RESTART IDENTITY resets seq.
  const sql = `TRUNCATE TABLE ${USER_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`;
  await prisma.$executeRawUnsafe(sql);

  console.log('\n[wipe] AFTER counts:');
  for (const t of USER_TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "${t}"`,
    );
    console.log(`  ${t.padEnd(28)} ${Number(rows[0]?.count ?? 0n)}`);
  }

  console.log('\n[wipe] preserved (unchanged):');
  const preserved = ['sports', 'competitions', 'teams', 'matches', 'assets'];
  for (const t of preserved) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "${t}"`,
    );
    console.log(`  ${t.padEnd(28)} ${Number(rows[0]?.count ?? 0n)}`);
  }

  console.log('\n[wipe] done. Sign up fresh from the app.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
