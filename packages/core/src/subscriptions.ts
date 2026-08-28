/** Shared subscription ↔ event/match matching for feeds and push scheduling. */

export type SubRow = {
  category: string;
  entityType: string;
  entityId: string;
};

function tagsOf(event: { contextTags?: string[] | null }): string[] {
  return event.contextTags ?? [];
}

function idsWithPrefix(tags: string[], prefix: string): Set<string> {
  return new Set(
    tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length)),
  );
}

/**
 * True when an Event (legacy timeline) matches the user's follow intent.
 *
 * Context tags written by upsertMatch:
 *   sportId | competition:<id> | team:<id> | player:<id> | provider:<name>
 *
 * Semantics (aligned with personalizedMatchWhere on the feed):
 *   - Followed team/player in the event → always a hit.
 *   - Sport-wide follow (no teams for this sport) → every event in the sport.
 *   - Competition follow with no teams for this sport → every match in that league.
 *   - Competition follow PLUS preferred teams → do not fan out to every club
 *     in the league. The competition is a filter, not an expander.
 *   - Individual-sport events with no team: tags (F1 sessions) still match a
 *     competition or sport-wide follow.
 *
 * Bare unprefixed ids in tags are ignored — they used to false-positive.
 */
export function eventMatchesSubs(
  event: { category: string; contextTags: string[] },
  subs: SubRow[],
): boolean {
  const relevant = subs.filter((s) => s.category === event.category);
  if (relevant.length === 0) return false;

  const tags = tagsOf(event);
  const eventTeamIds = idsWithPrefix(tags, 'team:');
  const eventCompId =
    tags.find((t) => t.startsWith('competition:'))?.slice('competition:'.length) ?? null;
  const eventPlayerIds = new Set([
    ...idsWithPrefix(tags, 'player:'),
    ...idsWithPrefix(tags, 'driver:'),
  ]);

  const teamIds = new Set(
    relevant.filter((s) => s.entityType === 'team').map((s) => s.entityId),
  );
  const compIds = new Set(
    relevant.filter((s) => s.entityType === 'competition').map((s) => s.entityId),
  );
  const playerIds = new Set(
    relevant
      .filter((s) => s.entityType === 'player' || s.entityType === 'driver')
      .map((s) => s.entityId),
  );
  const sportWide = relevant.some(
    (s) =>
      s.entityType === 'category' ||
      s.entityType === 'sport' ||
      s.entityId === s.category,
  );

  for (const id of eventTeamIds) {
    if (teamIds.has(id)) return true;
  }
  for (const id of eventPlayerIds) {
    if (playerIds.has(id)) return true;
  }

  // Sessions without sides (F1): a competition or sport-wide follow is enough.
  const hasSides = eventTeamIds.size > 0;

  if (sportWide && teamIds.size === 0) return true;
  if (sportWide && !hasSides) return true;

  if (eventCompId && compIds.has(eventCompId)) {
    if (teamIds.size === 0 || !hasSides) return true;
    // Preferred teams exist for this sport — already returned on a team hit.
    return false;
  }

  return false;
}

/**
 * Prisma `where` fragment for Match rows that satisfy the given subscriptions.
 * Category-level follows → whole sport; otherwise OR of competition/team ids.
 *
 * Prefer `personalizedMatchWhere` for user feeds — this helper does not
 * narrow a competition follow when the user also picked teams.
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
  if (competitionIds.size > 0 && teamIds.size === 0) {
    or.push({ competitionId: { in: [...competitionIds] } });
  }
  if (teamIds.size > 0) {
    or.push({ homeTeamId: { in: [...teamIds] } });
    or.push({ awayTeamId: { in: [...teamIds] } });
  }

  if (or.length === 0) return null;
  return { OR: or };
}
