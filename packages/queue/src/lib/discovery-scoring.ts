/**
 * Discovery layer scoring — for the "personal sports editor" briefing.
 *
 * Different weights and horizon-awareness from the 24h storyline scorer,
 * but it reuses `scoreEventForUser` as the importance signal.
 *
 * Composite score:
 *   total = 55% importance + 25% horizon + 20% novelty
 *
 * Diversity is enforced during the picker phase (`pickTopForDiscovery`),
 * not inside the score — we don't want two competitions to fight for the
 * same slot, so we pick round-robin across competitions.
 */

import { scoreEventForUser } from './event-importance.js';

export type DiscoveryHorizon =
  | 'TOMORROW'
  | 'DAY_AFTER'
  | 'THIS_WEEK'
  | 'THIS_WEEKEND'
  | 'NEXT_WEEK';

/* -------------------------------------------------------------------------- */
/*  Horizon classification                                                     */
/* -------------------------------------------------------------------------- */

function zonedYmd(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function ymdToUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function daysBetween(a: Date, b: Date, tz: string): number {
  const da = ymdToUtc(zonedYmd(a, tz));
  const db = ymdToUtc(zonedYmd(b, tz));
  return Math.round((db.getTime() - da.getTime()) / (24 * 60 * 60_000));
}

function zonedWeekday(at: Date, tz: string): number {
  // 0 = Sunday, 1 = Monday, …, 6 = Saturday.
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
    .format(at)
    .toLowerCase();
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(day.slice(0, 3));
}

export function horizonFor(startsAt: Date, now: Date, tz: string): DiscoveryHorizon | null {
  const d = daysBetween(now, startsAt, tz);
  if (d < 1) return null; // owned by the 24h storyline layer
  if (d === 1) return 'TOMORROW';
  if (d === 2) return 'DAY_AFTER';
  const w = zonedWeekday(startsAt, tz);
  const inWeekend = w === 6 || w === 0; // Sat / Sun
  if (d <= 6) return inWeekend ? 'THIS_WEEKEND' : 'THIS_WEEK';
  if (d <= 13) return 'NEXT_WEEK';
  return null; // beyond 14 days
}

/**
 * 0..100 horizon weight — closer events matter more, but we don't collapse
 * the far end to zero (a marquee event 8 days out still deserves a mention).
 */
export function horizonScore(h: DiscoveryHorizon): number {
  switch (h) {
    case 'TOMORROW':
      return 100;
    case 'DAY_AFTER':
      return 90;
    case 'THIS_WEEKEND':
      return 85;
    case 'THIS_WEEK':
      return 70;
    case 'NEXT_WEEK':
      return 45;
  }
}

/* -------------------------------------------------------------------------- */
/*  Novelty                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 0..100 novelty — how "fresh" it would feel to send this to the user.
 *   - No prior notifications for this (user, event) → 100
 *   - Storyline stage already scheduled              → 0 (skip entirely)
 *   - Discovery push < 3 days ago                    → 0 (skip)
 *   - Discovery push 3-5 days ago                    → 50
 *   - Any other prior push                           → 70
 */
export function computeNovelty(prior: {
  hasStoryline: boolean;
  lastDiscoveryDaysAgo: number | null;
  lastAnyDaysAgo: number | null;
}): number {
  if (prior.hasStoryline) return 0;
  if (prior.lastDiscoveryDaysAgo !== null && prior.lastDiscoveryDaysAgo < 3) return 0;
  if (prior.lastDiscoveryDaysAgo !== null && prior.lastDiscoveryDaysAgo < 6) return 50;
  if (prior.lastAnyDaysAgo !== null && prior.lastAnyDaysAgo < 5) return 60;
  return 100;
}

/* -------------------------------------------------------------------------- */
/*  Composite scorer                                                           */
/* -------------------------------------------------------------------------- */

type Sub = {
  category: string;
  entityType: string;
  entityId: string;
  filters?: unknown;
};

export type DiscoveryCandidate = {
  event: {
    id: string;
    category: string;
    title: string;
    subtitle: string | null;
    contextTags: string[];
    metadata: unknown;
    startsAt: Date;
  };
  horizon: DiscoveryHorizon;
  importance: number;
  importanceReasons: string[];
  horizonWeight: number;
  novelty: number;
  total: number;
  /** competition id for diversity — one push per comp per day max */
  competitionId: string | null;
};

export function scoreForDiscovery(
  event: DiscoveryCandidate['event'],
  subs: Sub[],
  horizon: DiscoveryHorizon,
  novelty: number,
): Omit<DiscoveryCandidate, 'event' | 'horizon' | 'competitionId'> {
  const { score: importance, reasons: importanceReasons } = scoreEventForUser(event, subs);
  const horizonWeight = horizonScore(horizon);
  const total = Math.round(importance * 0.55 + horizonWeight * 0.25 + novelty * 0.2);
  return { importance, importanceReasons, horizonWeight, novelty, total };
}

/* -------------------------------------------------------------------------- */
/*  Diversity-aware picker                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Pick up to `max` events for today's briefing.
 *
 * Rule 1 — never pick two events from the same competition.
 * Rule 2 — prefer sport diversity when scores are close.
 * Rule 3 — sort by total descending as the tiebreak.
 */
export function pickTopForDiscovery(
  candidates: DiscoveryCandidate[],
  max: number,
): DiscoveryCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.total - a.total);
  const chosen: DiscoveryCandidate[] = [];
  const usedComps = new Set<string>();
  const usedSports = new Set<string>();

  // Pass 1: strictly diverse by comp AND sport.
  for (const c of sorted) {
    if (chosen.length >= max) break;
    if (c.competitionId && usedComps.has(c.competitionId)) continue;
    if (usedSports.has(c.event.category)) continue;
    chosen.push(c);
    if (c.competitionId) usedComps.add(c.competitionId);
    usedSports.add(c.event.category);
  }

  // Pass 2: fill remaining slots with different comps but same-sport allowed.
  for (const c of sorted) {
    if (chosen.length >= max) break;
    if (chosen.includes(c)) continue;
    if (c.competitionId && usedComps.has(c.competitionId)) continue;
    chosen.push(c);
    if (c.competitionId) usedComps.add(c.competitionId);
  }

  return chosen;
}
