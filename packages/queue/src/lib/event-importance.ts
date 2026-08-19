/**
 * Deterministic 0..100 relevance score for (user, event).
 *
 * Drives multi-stage push scheduling: which stages activate for a given
 * event depend on this score, so the same event can produce zero, one, or
 * three notifications depending on how much the user cares about it.
 *
 * Thresholds (see schedule-pre-event.ts):
 *   score >= 30 → pre_event fires  (the 15-min-out reminder)
 *   score >= 55 → also morning_teaser  (~8am local, only if event is later today)
 *   score >= 75 → also midday_hype     (~5h before start)
 *
 * The scorer is intentionally cheap and pure — no LLM, no external calls.
 * Signals come from: user's active subscriptions, event.category (sport),
 * event.title / event.subtitle / event.metadata, and event.contextTags.
 */

type Sub = {
  category: string;
  entityType: string; // 'sport' | 'competition' | 'team'
  entityId: string;
  filters?: unknown;
};

export type ScoredEvent = {
  score: number;
  reasons: string[];
};

// Regex for competition names we consider "prestige" tier. Falls under the
// spirit of the spec — El Clásico / Champions League / World Cup / finals
// all clear +20. Keep tight; we don't want every mid-table cup to qualify.
const PRESTIGE_RE =
  /\b(champions league|europa league|copa libertadores|world cup|el cl[aá]sico|super\s?copa|community shield|dfb[-\s]?pokal|premier league|la liga|serie a|bundesliga|ligue 1|indian premier league|ipl|test\s+series|world test championship|ashes|formula 1|grand prix|wimbledon|us open|australian open|roland[-\s]?garros|french open|masters|nba finals)\b/i;

const FINAL_RE = /\b(final|semi[-\s]?final|semifinal|championship|title decider)\b/i;

const DERBY_TAG_HINTS = new Set([
  'derby',
  'rivalry',
  'clasico',
  'el-clasico',
  'north-london',
  'manchester-derby',
  'merseyside',
  'old-firm',
  'india-pakistan',
  'ashes',
]);

/**
 * Score how much a specific user cares about this event.
 * Non-followers can still score >0 for prestige events — we just don't cross
 * the multi-stage thresholds for them, so they only get the pre_event ping.
 */
export function scoreEventForUser(
  event: {
    id: string;
    category: string;
    title: string;
    subtitle: string | null;
    contextTags: string[];
    metadata: unknown;
  },
  subs: Sub[],
): ScoredEvent {
  let s = 0;
  const reasons: string[] = [];

  const relevantSubs = subs.filter((sub) => sub.category === event.category);

  // Followed entities. Highest-signal input.
  const followedTeamIds = new Set(
    relevantSubs.filter((s) => s.entityType === 'team').map((s) => s.entityId),
  );
  const followedCompIds = new Set(
    relevantSubs.filter((s) => s.entityType === 'competition').map((s) => s.entityId),
  );
  const followedSport = relevantSubs.some((s) => s.entityType === 'sport');

  // The event's mirrored contextTags include the team + competition FKs.
  const tags = event.contextTags ?? [];
  const eventTeamIds = new Set(
    tags.filter((t) => t.startsWith('team:')).map((t) => t.slice('team:'.length)),
  );
  const eventCompId = tags
    .find((t) => t.startsWith('competition:'))
    ?.slice('competition:'.length);

  const followedTeamHit = [...eventTeamIds].some((id) => followedTeamIds.has(id));
  const followedCompHit = eventCompId ? followedCompIds.has(eventCompId) : false;

  if (followedTeamHit) {
    s += 40;
    reasons.push('follows_team');
  } else if (followedCompHit) {
    s += 25;
    reasons.push('follows_competition');
  } else if (followedSport) {
    s += 15;
    reasons.push('follows_sport');
  }

  // Competition prestige.
  const hay = `${event.title} ${event.subtitle ?? ''}`;
  if (PRESTIGE_RE.test(hay)) {
    s += 20;
    reasons.push('prestige_competition');
  }

  // Tournament stage — semis + finals bump.
  const meta = (event.metadata ?? {}) as { round?: string | null };
  const roundText = `${meta.round ?? ''} ${event.subtitle ?? ''}`;
  if (FINAL_RE.test(roundText)) {
    s += 15;
    reasons.push('final_or_semi');
  }

  // Derby / rivalry tag.
  if (tags.some((t) => DERBY_TAG_HINTS.has(t) || t.startsWith('derby:'))) {
    s += 15;
    reasons.push('derby');
  }

  // Per-sport quirks.
  if (event.category === 'f1') {
    if (/\brace|grand prix\b/i.test(event.title)) {
      s += 20;
      reasons.push('f1_race');
    } else if (/\b(qualifying|quali|sprint|sprint shootout)\b/i.test(event.title)) {
      s += 10;
      reasons.push('f1_quali');
    } else if (/\bpractice\b/i.test(event.title)) {
      s -= 20;
      reasons.push('f1_practice');
    }
  }

  if (event.category === 'cricket') {
    if (/\b(test|world cup|world test|ashes|champions trophy|final|t20 world|odi world)\b/i.test(hay)) {
      s += 15;
      reasons.push('cricket_marquee');
    }
  }

  // Clamp to [0, 100]. Negative scores collapse to 0 so a cold "just here for
  // the fixture list" user still gets a pre-match tap on non-priority events.
  const clamped = Math.max(0, Math.min(100, s));
  return { score: clamped, reasons };
}

/**
 * Threshold gate — which stages activate for a given score.
 * Kept here (not in the scheduler) so the two files agree on semantics.
 */
export function stagesForScore(score: number): Array<'morning_teaser' | 'midday_hype' | 'pre_event'> {
  const stages: Array<'morning_teaser' | 'midday_hype' | 'pre_event'> = [];
  if (score >= 30) stages.push('pre_event');
  if (score >= 55) stages.push('morning_teaser');
  if (score >= 75) stages.push('midday_hype');
  return stages;
}
