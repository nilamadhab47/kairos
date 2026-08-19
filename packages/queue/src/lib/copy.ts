/**
 * Notification copy generator.
 *
 * Two tiers:
 *   1. Curated template pool per (kind, sport). Zero latency, zero cost, and
 *      deterministic on retries (index derived from `seed`).
 *   2. Anthropic Claude Haiku for the extra polish when `ANTHROPIC_API_KEY`
 *      is set. Runs at schedule time (not delivery time) so we bill exactly
 *      once per push, and the copy is cached in `Notification.title/body`.
 *
 * Anthropic path always falls back to a template on any error / timeout, so
 * scheduling never fails because the LLM did.
 *
 * Mobile push constraints (respected everywhere here):
 *   - title  ≤ 45 chars    (Android + iOS render well; watchOS truncates further)
 *   - body   ≤ 120 chars   (2 lines on most modern lockscreens)
 *   - no URLs, no emojis unless sport-defining (⚽ 🏏 🏎), no ALL CAPS.
 */

import { prisma } from '@kairo/db';

/* -------------------------------------------------------------------------- */

export type CopyKind = 'pre_event' | 'live_now' | 'welcome' | 'test';

export type CopyContext = {
  kind: CopyKind;
  /** Deterministic seed for template selection — use `notificationId` or `${userId}:${eventId}`. */
  seed: string;
  /** Sport id, e.g. 'football', 'f1', 'cricket', 'tennis'. */
  sport?: string | null;
  /** Human sport label (e.g. "Formula 1"). */
  sportLabel?: string | null;
  /** Competition name, e.g. "Premier League". */
  competition?: string | null;
  /** Home / away team names — omit for individual sports. */
  homeTeam?: string | null;
  awayTeam?: string | null;
  /** Round / matchweek / grand prix, e.g. "Matchweek 4", "Italian GP". */
  round?: string | null;
  /** Venue city / stadium — used sparingly. */
  venue?: string | null;
  /** Minutes until start (pre_event). */
  minsUntil?: number;
  /** Recipient user id — used to fetch recent titles for de-duping. */
  userId?: string;
  /** Recipient first name (for welcome). */
  firstName?: string | null;
  /** Signal that this is a rivalry / derby — enables spicier copy. */
  isDerby?: boolean;
};

export type Copy = { title: string; body: string; aiGenerated: boolean };

/* -------------------------------------------------------------------------- */
/*  Deterministic hashing (no external dep — good enough for template picks). */
/* -------------------------------------------------------------------------- */

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: string): T {
  const idx = hash(seed) % arr.length;
  return arr[idx]!;
}

/* -------------------------------------------------------------------------- */
/*  Template pool. Placeholders:                                              */
/*    {mins} — minutes until start                                            */
/*    {match} — "Arsenal vs Chelsea" for team sports, competition/round otherwise
 *    {competition} — "Premier League"
 *    {round} — "Matchweek 4" / "Italian GP" / "1st T20"
 *    {home}, {away} — team names
 *    {name} — first name (welcome kind only)
 */
/* -------------------------------------------------------------------------- */

type Template = { title: string; body: string };

const PRE_EVENT_TEAM: Template[] = [
  { title: '{home} vs {away} — {mins}m to go', body: 'Kickoff in {mins} minutes. Get comfy.' },
  { title: '{match} kicks off in {mins}m', body: '{competition}{roundSuffix}' },
  { title: 'Nearly there — {mins}m out', body: '{home} vs {away} in {competition}.' },
  { title: '{competition}: {mins}m warning', body: '{home} vs {away}. Ready?' },
  { title: 'Puck about to drop', body: '{home} vs {away} — {mins}m.' },
  { title: 'On in {mins}', body: '{home} take on {away}{compSuffix}.' },
  { title: 'Match day. {mins}m.', body: '{home} vs {away}{compSuffix}.' },
];

const PRE_EVENT_TEAM_DERBY: Template[] = [
  { title: 'Derby day — {mins}m to go', body: '{home} vs {away}. Buckle up.' },
  { title: 'It’s on: {home} vs {away}', body: 'Rivalry night, {mins} minutes out.' },
  { title: '{mins}m to the big one', body: '{home} vs {away}{compSuffix}.' },
];

const PRE_EVENT_F1: Template[] = [
  { title: '{round} lights out in {mins}m', body: 'Formula 1 — {competition}.' },
  { title: 'Lights out shortly', body: '{round}, {mins} minutes away.' },
  { title: 'F1 warmup — {mins}m to go', body: '{round}{compSuffix}.' },
  { title: 'Grid is forming', body: '{round} in {mins} minutes.' },
];

const PRE_EVENT_CRICKET: Template[] = [
  { title: '{home} vs {away} — {mins}m', body: '{competition}{roundSuffix}. Toss soon.' },
  { title: 'Bat & ball ready — {mins}m', body: '{home} vs {away}{compSuffix}.' },
  { title: '{competition}: {mins}m to first ball', body: '{home} vs {away}.' },
];

const PRE_EVENT_TENNIS: Template[] = [
  { title: '{home} vs {away} — {mins}m', body: '{competition}{roundSuffix}. First serve soon.' },
  { title: 'On court in {mins}m', body: '{home} vs {away}{compSuffix}.' },
];

const PRE_EVENT_GENERIC: Template[] = [
  { title: 'Starting in {mins}m', body: '{match}' },
  { title: '{mins}m warning', body: '{match}' },
];

const LIVE_NOW_TEAM: Template[] = [
  { title: '{home} vs {away} is live', body: '{competition}{roundSuffix}. Tap in.' },
  { title: 'Underway: {match}', body: '{competition}.' },
];

const LIVE_NOW_F1: Template[] = [
  { title: 'Lights out — {round}', body: 'Formula 1 is live.' },
  { title: '{round} underway', body: '{competition}.' },
];

const LIVE_NOW_GENERIC: Template[] = [
  { title: 'Live now: {match}', body: '{competition}.' },
];

const WELCOME: Template[] = [
  {
    title: 'Welcome to Kairos{nameSuffix}',
    body: 'We’ll nudge you ~15 minutes before matches and races you follow. Nothing else.',
  },
  {
    title: '{nameSalutation}You’re in.',
    body: 'Quiet by default. We only ping for the events you actually care about.',
  },
  {
    title: 'All set{nameSuffix}',
    body: 'You’ll hear from us right before kickoff, lights out, or first ball. Never before.',
  },
];

/* -------------------------------------------------------------------------- */

function templatePoolFor(ctx: CopyContext): Template[] {
  if (ctx.kind === 'welcome' || ctx.kind === 'test') return WELCOME;

  const isTeam = Boolean(ctx.homeTeam && ctx.awayTeam);

  if (ctx.kind === 'live_now') {
    if (ctx.sport === 'f1') return LIVE_NOW_F1;
    if (isTeam) return LIVE_NOW_TEAM;
    return LIVE_NOW_GENERIC;
  }

  // pre_event
  if (ctx.sport === 'f1') return PRE_EVENT_F1;
  if (ctx.sport === 'cricket' && isTeam) return PRE_EVENT_CRICKET;
  if (ctx.sport === 'tennis' && isTeam) return PRE_EVENT_TENNIS;
  if (isTeam) return ctx.isDerby ? PRE_EVENT_TEAM_DERBY : PRE_EVENT_TEAM;
  return PRE_EVENT_GENERIC;
}

function renderTemplate(t: Template, ctx: CopyContext): { title: string; body: string } {
  const nameSuffix = ctx.firstName ? `, ${ctx.firstName}` : '';
  const nameSalutation = ctx.firstName ? `${ctx.firstName} — ` : '';
  const round = ctx.round ?? '';
  const roundSuffix = round ? ` · ${round}` : '';
  const compSuffix = ctx.competition ? ` in ${ctx.competition}` : '';
  const match =
    ctx.homeTeam && ctx.awayTeam
      ? `${ctx.homeTeam} vs ${ctx.awayTeam}`
      : ctx.competition
        ? `${ctx.competition}${roundSuffix}`
        : ctx.round ?? 'Upcoming event';

  const vars: Record<string, string> = {
    mins: String(ctx.minsUntil ?? 15),
    match,
    competition: ctx.competition ?? '',
    round,
    roundSuffix,
    compSuffix,
    home: ctx.homeTeam ?? '',
    away: ctx.awayTeam ?? '',
    name: ctx.firstName ?? '',
    nameSuffix,
    nameSalutation,
  };

  const replace = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

  return { title: replace(t.title).trim(), body: replace(t.body).trim() };
}

/* -------------------------------------------------------------------------- */
/*  Validation / sanitization — applied to LLM output too.                    */
/* -------------------------------------------------------------------------- */

const BLOCKED = /https?:\/\/|www\.|@\w+|(fuck|shit|damn)\b/i;

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  // Trim on word boundary.
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

function safeCopy(title: string, body: string): { title: string; body: string } | null {
  const t = truncate(title, 45);
  const b = truncate(body, 120);
  if (!t) return null;
  if (BLOCKED.test(t) || BLOCKED.test(b)) return null;
  return { title: t, body: b };
}

/* -------------------------------------------------------------------------- */
/*  Anthropic (Claude Haiku)                                                  */
/* -------------------------------------------------------------------------- */

async function recentTitlesForUser(userId: string, limit = 5): Promise<string[]> {
  try {
    const rows = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { title: true },
    });
    return rows.map((r) => r.title).filter(Boolean);
  } catch {
    return [];
  }
}

async function generateWithAnthropic(
  ctx: CopyContext,
): Promise<{ title: string; body: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  // Import lazily so the queue package still builds without the SDK
  // (e.g. before `pnpm install` runs after the dependency was added).
  let Anthropic: typeof import('@anthropic-ai/sdk').default;
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default;
  } catch {
    return null;
  }

  const client = new Anthropic({ apiKey });

  const recentTitles = ctx.userId ? await recentTitlesForUser(ctx.userId) : [];

  const context = {
    kind: ctx.kind,
    sport: ctx.sportLabel ?? ctx.sport ?? null,
    competition: ctx.competition ?? null,
    homeTeam: ctx.homeTeam ?? null,
    awayTeam: ctx.awayTeam ?? null,
    round: ctx.round ?? null,
    minutesUntilStart: ctx.minsUntil ?? null,
    isDerby: ctx.isDerby ?? false,
    firstName: ctx.firstName ?? null,
    recentTitlesUserHasSeen: recentTitles,
  };

  const system = [
    'You write mobile push notifications for a sports reminder app called Kairos.',
    'Voice: confident, warm, a little witty. Never spammy, never clickbait, never ALL CAPS.',
    'Constraints:',
    '- title: ≤ 45 characters. No emojis unless the sport uses them by default. No trailing punctuation.',
    '- body: ≤ 120 characters. One or two sentences.',
    '- Do not repeat or paraphrase any string in `recentTitlesUserHasSeen`.',
    '- Use the team names verbatim if given. Do not invent facts.',
    '- Never include URLs, hashtags, or @-mentions.',
    'Return ONLY a JSON object of the form {"title": "...", "body": "..."}. No prose, no code fences.',
  ].join('\n');

  const user = `Write one notification. Context:\n${JSON.stringify(context, null, 2)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);

  try {
    const res = await client.messages.create(
      {
        model: 'claude-haiku-4-5',
        max_tokens: 120,
        temperature: 0.8,
        system,
        messages: [{ role: 'user', content: user }],
      },
      { signal: controller.signal, maxRetries: 1 },
    );
    clearTimeout(timeout);

    const block = res.content.find((c) => c.type === 'text');
    if (!block || block.type !== 'text') return null;
    // Model sometimes wraps in ```json fences despite the instruction — strip.
    const raw = block.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
    const parsed = JSON.parse(raw) as { title?: unknown; body?: unknown };
    if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') return null;

    const safe = safeCopy(parsed.title, parsed.body);
    if (!safe) return null;

    // De-dupe against the last few titles this user has already seen.
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (recentTitles.some((t) => norm(t) === norm(safe.title))) return null;

    return safe;
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[copy.anthropic.fallback]', {
      kind: ctx.kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                        */
/* -------------------------------------------------------------------------- */

export async function composeCopy(ctx: CopyContext): Promise<Copy> {
  const templatePool = templatePoolFor(ctx);
  const templateChoice = pick(templatePool, ctx.seed);
  const rendered = renderTemplate(templateChoice, ctx);
  const templateFallback: Copy = {
    ...(safeCopy(rendered.title, rendered.body) ?? {
      title: 'Match starting soon',
      body: 'Tap to open Kairos.',
    }),
    aiGenerated: false,
  };

  // Try LLM when configured. On any failure we return the deterministic
  // template — never let scheduling depend on Anthropic's availability.
  const ai = await generateWithAnthropic(ctx);
  if (ai) return { ...ai, aiGenerated: true };
  return templateFallback;
}
