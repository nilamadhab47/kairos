/**
 * Canonical match status for API + UI.
 *
 * Ingest can leave a fixture as `scheduled` after kickoff (football is only
 * re-pulled every 6h) or leave `live` stuck after full time. The phone used
 * to render a live card with a countdown + pulsing pill for every stale row,
 * which froze the app. Always derive an effective status from (raw, kickoff, sport).
 */

const LIVE_ALIASES = new Set([
  'live',
  'in',
  'in_progress',
  'inplay',
  '1h',
  '2h',
  'ht',
  'et',
  'halftime',
  'first_half',
  'second_half',
]);

const DONE_ALIASES = new Set([
  'completed',
  'complete',
  'ft',
  'finished',
  'ended',
  'final',
  'post',
]);

export type EffectiveMatchStatus =
  | 'scheduled'
  | 'live'
  | 'completed'
  | 'cancelled'
  | 'postponed';

/** How long a fixture can reasonably stay "in play" before we treat it as done. */
export function liveWindowMs(sportId?: string): number {
  switch (sportId) {
    case 'cricket':
      return 5 * 24 * 60 * 60_000; // tests
    case 'tennis':
      return 6 * 60 * 60_000;
    case 'f1':
      return 3 * 60 * 60_000;
    default:
      return 4 * 60 * 60_000; // football
  }
}

export function effectiveMatchStatus(
  status: string | null | undefined,
  startsAt: Date | string | number,
  sportId?: string,
): EffectiveMatchStatus {
  const s = (status ?? '').toLowerCase().trim();
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'postponed') return 'postponed';

  const start =
    typeof startsAt === 'number'
      ? startsAt
      : startsAt instanceof Date
        ? startsAt.getTime()
        : new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return DONE_ALIASES.has(s) ? 'completed' : 'scheduled';

  const age = Date.now() - start;
  const window = liveWindowMs(sportId);

  if (DONE_ALIASES.has(s)) return 'completed';
  if (LIVE_ALIASES.has(s)) return age > window ? 'completed' : 'live';

  // Kickoff has passed but ingest still says scheduled — show live, then FT.
  if (age > window) return 'completed';
  if (age > 0) return 'live';
  return 'scheduled';
}
