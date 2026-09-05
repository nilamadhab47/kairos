import type { TodayEvent } from '@/components';

/* -------------------------------------------------------------------------- */
/*  Shared types for /api/me/today, /api/me/week, /api/me/feed                */
/* -------------------------------------------------------------------------- */

export type TeamRef = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  type: string | null;
};

export type CompetitionRef = {
  id: string;
  name: string;
  displayName: string | null;
  label: string;
  country: string | null;
  logoUrl: string | null;
  season: string | null;
  format: string | null;
};

export type FeedMatch = {
  id: string;
  sportId: string;
  competition: CompetitionRef;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
  startsAt: string;
  status: string;
  score: { home: number | null; away: number | null };
  venue: string | null;
  round: string | null;
};

/**
 * Some ingested rows carry status strings ("Full Time", "Scheduled", …)
 * in the round column. Filter them out at the adapter layer so every
 * screen (cards, list rows, detail sheet) shows a real round or nothing.
 */
export function cleanRound(round: string | null | undefined): string | null {
  if (!round) return null;
  const s = round.trim().toLowerCase();
  const statusy = new Set([
    '', 'ft', 'full time', 'fulltime', 'final', 'finished', 'completed',
    'complete', 'ended', 'in progress', 'live', 'ongoing', 'scheduled',
    'postponed', 'half time', 'halftime', 'ht',
  ]);
  return statusy.has(s) ? null : round;
}

/**
 * Adapt a `FeedMatch` from any /me/* endpoint into the shape `EventCard`
 * expects. Kept as a single function so a change to the card's contract
 * only needs updating in one place.
 */
export function matchToEvent(m: FeedMatch): TodayEvent {
  const round = cleanRound(m.round);
  return {
    id: m.id,
    category: m.sportId,
    title:
      m.homeTeam && m.awayTeam
        ? `${m.homeTeam.name} vs ${m.awayTeam.name}`
        : m.competition.label,
    subtitle: [m.competition.label, round].filter(Boolean).join(' · '),
    startsAt: m.startsAt,
    status: m.status,
    metadata: {
      matchId: m.id,
      homeTeam: m.homeTeam
        ? { name: m.homeTeam.name, logoUrl: m.homeTeam.logoUrl ?? null }
        : undefined,
      awayTeam: m.awayTeam
        ? { name: m.awayTeam.name, logoUrl: m.awayTeam.logoUrl ?? null }
        : undefined,
      score: m.score,
      venue: m.venue ?? undefined,
      round: round ?? undefined,
    },
  };
}

/**
 * Format a YYYY-MM-DD in the user's timezone. Used by day-grouping in
 * the Calendar and Alerts screens.
 */
export function ymdInTz(iso: string | Date, tz?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${day}`;
}
