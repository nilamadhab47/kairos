/**
 * Sports taxonomy seed.
 *
 * These rows are NOT sports data — they are the canonical taxonomy that
 * provider adapters (`SportId`) and user subscriptions reference.
 * All competitions, teams, matches, players and standings must come from
 * real provider APIs — never seeded here.
 *
 * Run:  pnpm --filter @kairo/db seed:sports
 */

import { prisma } from '../src/index.js';

interface SportRow {
  id: string;
  name: string;
  sortOrder: number;
}

const SPORTS: SportRow[] = [
  { id: 'football', name: 'Football', sortOrder: 10 },
  { id: 'cricket', name: 'Cricket', sortOrder: 20 },
  { id: 'f1', name: 'Formula 1', sortOrder: 30 },
  { id: 'tennis', name: 'Tennis', sortOrder: 40 },
  { id: 'basketball', name: 'Basketball', sortOrder: 50 },
  { id: 'hockey', name: 'Ice Hockey', sortOrder: 60 },
  { id: 'baseball', name: 'Baseball', sortOrder: 70 },
];

async function main(): Promise<void> {
  for (const row of SPORTS) {
    await prisma.sport.upsert({
      where: { id: row.id },
      update: { name: row.name, sortOrder: row.sortOrder, isActive: true },
      create: { id: row.id, name: row.name, sortOrder: row.sortOrder, isActive: true },
    });
  }
  const count = await prisma.sport.count();
  // eslint-disable-next-line no-console
  console.log(`[seed:sports] ${count} sport taxonomy rows present`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed:sports] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
