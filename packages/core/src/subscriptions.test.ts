/**
 * Push / feed subscription matching.
 *
 *   pnpm --filter @kairo/core exec tsx src/subscriptions.test.ts
 */

import { strict as assert } from 'node:assert';
import { eventMatchesSubs, matchWhereFromSubs, type SubRow } from './subscriptions.js';

const PL = 'comp-pl';
const ARSENAL = 'team-ars';
const CHELSEA = 'team-che';
const LALIGA = 'comp-laliga';

function event(opts: {
  category?: string;
  competition?: string | null;
  teams?: string[];
  players?: string[];
}): { category: string; contextTags: string[] } {
  const category = opts.category ?? 'football';
  const tags = [category];
  if (opts.competition) tags.push(`competition:${opts.competition}`);
  for (const t of opts.teams ?? []) tags.push(`team:${t}`);
  for (const p of opts.players ?? []) tags.push(`player:${p}`);
  return { category, contextTags: tags };
}

const plArsenal: SubRow[] = [
  { category: 'football', entityType: 'competition', entityId: PL },
  { category: 'football', entityType: 'team', entityId: ARSENAL },
];

const plOnly: SubRow[] = [
  { category: 'football', entityType: 'competition', entityId: PL },
];

const sportWide: SubRow[] = [
  { category: 'football', entityType: 'category', entityId: 'football' },
];

assert.equal(
  eventMatchesSubs(event({ competition: PL, teams: [ARSENAL, CHELSEA] }), plArsenal),
  true,
  'followed team in a followed league → notify',
);

assert.equal(
  eventMatchesSubs(event({ competition: PL, teams: [CHELSEA, 'team-liv'] }), plArsenal),
  false,
  'other clubs in a followed league must not notify when the user picked teams',
);

assert.equal(
  eventMatchesSubs(event({ competition: 'comp-ucl', teams: [ARSENAL, 'team-rm'] }), plArsenal),
  true,
  'followed team in another competition still notifies',
);

assert.equal(
  eventMatchesSubs(event({ competition: PL, teams: [CHELSEA, 'team-liv'] }), plOnly),
  true,
  'league-only follow notifies every match in that league',
);

assert.equal(
  eventMatchesSubs(event({ competition: LALIGA, teams: [CHELSEA, 'team-rm'] }), plOnly),
  false,
  'league-only follow does not notify other leagues',
);

assert.equal(
  eventMatchesSubs(event({ competition: LALIGA, teams: [CHELSEA, 'team-rm'] }), sportWide),
  true,
  'sport-wide follow (no teams) notifies the whole sport',
);

assert.equal(
  eventMatchesSubs(event({ category: 'cricket', competition: PL, teams: [ARSENAL] }), plArsenal),
  false,
  'wrong sport never matches',
);

assert.equal(
  eventMatchesSubs(
    event({ competition: PL, teams: [CHELSEA], players: ['player-x'] }),
    [{ category: 'football', entityType: 'player', entityId: 'player-x' }],
  ),
  true,
  'player follow matches player: tags',
);

assert.equal(
  eventMatchesSubs(
    { category: 'football', contextTags: ['football', PL, ARSENAL] },
    plArsenal,
  ),
  false,
  'bare unprefixed ids in tags must not match',
);

assert.equal(
  eventMatchesSubs(
    { category: 'f1', contextTags: ['f1', `competition:${PL}`] },
    [{ category: 'f1', entityType: 'competition', entityId: PL }],
  ),
  true,
  'F1 sessions with no team tags still match a competition follow',
);

const where = matchWhereFromSubs(plArsenal);
assert.ok(where && 'OR' in where);
const or = where.OR;
assert.equal(
  or.some((c) => 'competitionId' in c),
  false,
  'matchWhereFromSubs must not expand a competition when teams are also followed',
);
assert.equal(
  or.some((c) => JSON.stringify(c).includes(ARSENAL)),
  true,
  'matchWhereFromSubs still includes followed teams',
);

const leagueWhere = matchWhereFromSubs(plOnly);
assert.ok(leagueWhere && 'OR' in leagueWhere);
assert.equal(
  leagueWhere.OR.some((c) => 'competitionId' in c),
  true,
  'league-only follow still queries the competition',
);

console.log('ok   eventMatchesSubs + matchWhereFromSubs');
