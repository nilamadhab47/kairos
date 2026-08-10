import { prisma } from '@kairo/db';
import { matchWhereFromSubs } from '@kairo/core';

function zonedDayBounds(tz: string, ref = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ref);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const guess = new Date(`${y}-${m}-${d}T00:00:00Z`);
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const asZoned = new Date(guess.toLocaleString('en-US', { timeZone: tz })).getTime();
  const start = new Date(guess.getTime() - (asZoned - asUtc));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

async function main() {
  const user = await prisma.user.findFirstOrThrow({
    where: { subscriptions: { some: { isActive: true } } },
    include: { subscriptions: { where: { isActive: true } } },
  });
  console.log(`User: ${user.email} (tz=${user.timezone})`);
  console.log(`Subscriptions: ${user.subscriptions.length}`);
  for (const s of user.subscriptions) console.log(`  · ${s.category} / ${s.entityType} / ${s.entityName}`);

  const { start, end } = zonedDayBounds(user.timezone);
  const where = matchWhereFromSubs(user.subscriptions)!;
  const now = new Date();
  const lookAheadEnd = new Date(end.getTime() + 6 * 60 * 60_000);

  const include = {
    competition: { select: { id: true, name: true, displayName: true, logoUrl: true } },
    homeTeam: { select: { id: true, name: true, logoUrl: true } },
    awayTeam: { select: { id: true, name: true, logoUrl: true } },
  } as const;

  const [today, live, upcoming] = await Promise.all([
    prisma.match.findMany({ where: { AND: [where as object, { startsAt: { gte: start, lt: end } }, { status: { not: 'cancelled' } }] }, include, orderBy: { startsAt: 'asc' }, take: 200 }),
    prisma.match.findMany({ where: { AND: [where as object, { status: 'live' }] }, include, orderBy: { startsAt: 'asc' }, take: 30 }),
    prisma.match.findMany({ where: { AND: [where as object, { startsAt: { gte: end, lt: lookAheadEnd } }, { status: { not: 'cancelled' } }] }, include, orderBy: { startsAt: 'asc' }, take: 20 }),
  ]);

  console.log(`\nWindow: ${start.toISOString()} → ${end.toISOString()} (today in ${user.timezone})`);
  console.log(`today=${today.length} live=${live.length} upcoming_after_today=${upcoming.length}`);

  const nextUpPool = [
    ...live,
    ...today.filter(m => m.startsAt >= now),
    ...upcoming,
  ];
  const seen = new Set<string>();
  const nextUp = [];
  for (const m of nextUpPool) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    nextUp.push(m);
    if (nextUp.length >= 3) break;
  }
  console.log(`\nNEXT UP (${nextUp.length}):`);
  for (const m of nextUp) {
    const comp = m.competition.displayName ?? m.competition.name;
    const teams = m.homeTeam && m.awayTeam ? `${m.homeTeam.name} vs ${m.awayTeam.name}` : '(session)';
    console.log(`  · ${m.startsAt.toISOString()} [${m.sportId}] ${comp} — ${teams}`);
  }

  const sportIds = [...new Set(today.map(m => m.sportId))];
  const sports = await prisma.sport.findMany({ where: { id: { in: sportIds } }, orderBy: { sortOrder: 'asc' } });
  console.log(`\nGROUPS (${sports.length} sports):`);
  for (const s of sports) {
    const rows = today.filter(m => m.sportId === s.id);
    console.log(`  ${s.name} (${rows.length}):`);
    for (const m of rows.slice(0, 3)) {
      const comp = m.competition.displayName ?? m.competition.name;
      console.log(`    · ${m.startsAt.toISOString()} ${comp} ${m.homeTeam?.name ?? '(session)'} vs ${m.awayTeam?.name ?? ''}`);
    }
    if (rows.length > 3) console.log(`    … +${rows.length - 3} more`);
  }
}
main().finally(() => prisma.$disconnect());
