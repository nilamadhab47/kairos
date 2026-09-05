/** Re-export shared matchers so server routes keep a stable import path. */
export {
  eventMatchesSubs,
  matchWhereFromSubs,
  type SubRow,
} from '@kairo/core';

import { prisma, type Prisma } from '@kairo/db';
import { isLaunchSport } from '@kairo/core';
import { competitionFamilyIds } from './competitions.js';

/**
 * Sports whose matches don't use `homeTeamId` / `awayTeamId` — the row is a
 * session, not a head-to-head. A team follow (e.g. Ferrari) really means
 * "I want the championship" here, so we promote it to a competition follow
 * during query building.
 */
const INDIVIDUAL_SPORTS = new Set(['f1']);

/**
 * Build a Prisma `where` for the Match table that reflects the user's real
 * follow intent, one sport at a time.
 *
 * Semantics (matches user expectation in the "Sevilla vs Rayo" bug):
 *
 *   Sport-wide  (no comps + no teams for this sport):
 *     -> include every match in this sport
 *
 *   Per followed competition:
 *     - if the user ALSO follows teams that play in that competition,
 *       narrow to those teams within it (competition acts as a filter
 *       for the picked teams, not as an "include everything" flag)
 *     - otherwise include every match in that competition
 *
 *   Teams (always):
 *     -> every match involving that team, in any competition (UCL, cups, …)
 *        even when the user also followed a domestic league those teams play in.
 *
 * Competition ids are expanded to season/provider "family" clones so a
 * follow of a stale La Liga row still sees fixtures on the live season row.
 *
 * Returns `null` when the user has no active subscriptions.
 */
export async function personalizedMatchWhere(
  userId: string,
  opts: { extraFilter?: Prisma.MatchWhereInput } = {},
): Promise<Prisma.MatchWhereInput | null> {
  const subs = await prisma.userSubscription.findMany({
    where: { userId, isActive: true },
    select: { category: true, entityType: true, entityId: true },
  });
  if (subs.length === 0) return null;

  // Bucket by sport.
  const bySport = new Map<
    string,
    { sportWide: boolean; comps: Set<string>; teams: Set<string> }
  >();
  for (const s of subs) {
    if (!isLaunchSport(s.category)) continue;
    const bucket = bySport.get(s.category) ?? {
      sportWide: false,
      comps: new Set<string>(),
      teams: new Set<string>(),
    };
    if (s.entityType === 'category' || s.entityId === s.category) {
      bucket.sportWide = true;
    } else if (s.entityType === 'competition') {
      bucket.comps.add(s.entityId);
    } else if (s.entityType === 'team') {
      bucket.teams.add(s.entityId);
    }
    bySport.set(s.category, bucket);
  }

  // Individual sports: promote team follows to the linked competition and
  // drop the team from the bucket, so downstream logic doesn't try to
  // narrow by `homeTeamId` / `awayTeamId` (both are null on F1 sessions).
  for (const [sportId, bucket] of bySport) {
    if (!INDIVIDUAL_SPORTS.has(sportId)) continue;
    if (bucket.teams.size === 0) continue;
    const links = await prisma.teamCompetition.findMany({
      where: { teamId: { in: [...bucket.teams] } },
      select: { competitionId: true },
    });
    for (const l of links) bucket.comps.add(l.competitionId);
    bucket.teams.clear();
  }

  // Expand every followed competition to its season/provider family.
  const rawCompIds = [...new Set([...bySport.values()].flatMap((b) => [...b.comps]))];
  const familyIds = rawCompIds.length > 0 ? await competitionFamilyIds(rawCompIds) : [];
  const familyBySeed = new Map<string, string[]>();
  if (rawCompIds.length > 0) {
    // Map each seed → its family (competitionFamilyIds returns the union;
    // resolve per-seed so narrowing stays scoped to that league).
    await Promise.all(
      rawCompIds.map(async (id) => {
        familyBySeed.set(id, await competitionFamilyIds(id));
      }),
    );
  }
  const allCompIds = [...new Set(familyIds)];

  // Which of the user's followed teams belong to which of the user's
  // followed competitions? Lets us decide whether a team follow "narrows"
  // a comp follow or stands alone.
  const allTeamIds = [...new Set([...bySport.values()].flatMap((b) => [...b.teams]))];
  const teamCompLinks =
    allTeamIds.length > 0 && allCompIds.length > 0
      ? await prisma.teamCompetition.findMany({
          where: {
            teamId: { in: allTeamIds },
            competitionId: { in: allCompIds },
          },
          select: { teamId: true, competitionId: true },
        })
      : [];
  const teamsByComp = new Map<string, Set<string>>();
  for (const link of teamCompLinks) {
    if (!teamsByComp.has(link.competitionId)) teamsByComp.set(link.competitionId, new Set());
    teamsByComp.get(link.competitionId)!.add(link.teamId);
  }

  const orClauses: Prisma.MatchWhereInput[] = [];

  for (const [sportId, bucket] of bySport) {
    if (bucket.sportWide) {
      orClauses.push({ sportId });
      continue;
    }

    // Per-competition clauses (expanded to family clones).
    for (const compId of bucket.comps) {
      const family = familyBySeed.get(compId) ?? [compId];
      const narrowingTeams = [
        ...new Set(family.flatMap((fid) => [...(teamsByComp.get(fid) ?? [])])),
      ].filter((t) => bucket.teams.has(t));
      if (narrowingTeams.length > 0) {
        orClauses.push({
          competitionId: { in: family },
          OR: [
            { homeTeamId: { in: narrowingTeams } },
            { awayTeamId: { in: narrowingTeams } },
          ],
        });
      } else {
        orClauses.push({ competitionId: { in: family } });
      }
    }

    // Followed clubs: every fixture they play (UCL, cups, etc.), not only
    // the leagues the user also ticked in onboarding.
    if (bucket.teams.size > 0) {
      orClauses.push({
        sportId,
        OR: [
          { homeTeamId: { in: [...bucket.teams] } },
          { awayTeamId: { in: [...bucket.teams] } },
        ],
      });
    }
  }

  if (orClauses.length === 0) return null;

  const where: Prisma.MatchWhereInput = { OR: orClauses };
  return opts.extraFilter ? { AND: [where, opts.extraFilter] } : where;
}
