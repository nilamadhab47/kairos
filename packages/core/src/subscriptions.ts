/** Shared subscription ↔ event/match matching for feeds and push scheduling. */

export type SubRow = {
  category: string;
  entityType: string;
  entityId: string;
};

/**
 * True when an Event (legacy timeline) matches any active subscription.
 * Context tags written by upsertMatch:
 *   sportId | competition:<id> | team:<id> | player:<id> | provider:<name>
 */
export function eventMatchesSubs(
  event: { category: string; contextTags: string[] },
  subs: SubRow[],
): boolean {
  return subs.some((sub) => {
    if (sub.category !== event.category) return false;
    if (sub.entityType === 'category' || sub.entityId === sub.category) return true;

    const tags = event.contextTags ?? [];
    switch (sub.entityType) {
      case 'competition':
        return (
          tags.includes(`competition:${sub.entityId}`) || tags.includes(sub.entityId)
        );
      case 'team':
        return tags.includes(`team:${sub.entityId}`) || tags.includes(sub.entityId);
      case 'player':
      case 'driver':
        return (
          tags.includes(`player:${sub.entityId}`) ||
          tags.includes(`driver:${sub.entityId}`) ||
          tags.includes(sub.entityId)
        );
      default:
        return (
          tags.includes(`team:${sub.entityId}`) ||
          tags.includes(`competition:${sub.entityId}`) ||
          tags.includes(`player:${sub.entityId}`) ||
          tags.includes(sub.entityId)
        );
    }
  });
}

/**
 * Prisma `where` fragment for Match rows that satisfy the given subscriptions.
 * Category-level follows → whole sport; otherwise OR of competition/team ids.
 */
export function matchWhereFromSubs(
  subs: SubRow[],
): { sportId: { in: string[] } } | { OR: Array<Record<string, unknown>> } | null {
  if (subs.length === 0) return null;

  const sportWide = new Set<string>();
  const competitionIds = new Set<string>();
  const teamIds = new Set<string>();

  for (const sub of subs) {
    if (sub.entityType === 'category' || sub.entityId === sub.category) {
      sportWide.add(sub.category);
      continue;
    }
    if (sub.entityType === 'competition') competitionIds.add(sub.entityId);
    else if (sub.entityType === 'team') teamIds.add(sub.entityId);
    else {
      sportWide.add(sub.category);
    }
  }

  const or: Array<Record<string, unknown>> = [];
  if (sportWide.size > 0) {
    or.push({ sportId: { in: [...sportWide] } });
  }
  if (competitionIds.size > 0) {
    or.push({ competitionId: { in: [...competitionIds] } });
  }
  if (teamIds.size > 0) {
    or.push({ homeTeamId: { in: [...teamIds] } });
    or.push({ awayTeamId: { in: [...teamIds] } });
  }

  if (or.length === 0) return null;
  return { OR: or };
}
