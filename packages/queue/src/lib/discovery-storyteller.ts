/**
 * Discovery-layer copy generator.
 *
 * Different shape from the 3-stage storyteller: one push per (user, event),
 * horizon-aware, and each candidate is TAGGED with a story angle so the
 * picker can enforce cross-briefing diversity ("don't send three RIVALRY
 * hooks in the same morning").
 *
 * Fall back to templates on any Anthropic error — scheduling must never
 * depend on the LLM being up.
 */

import { prisma } from '@kairo/db';
import type { DiscoveryHorizon } from './discovery-scoring.js';

/* -------------------------------------------------------------------------- */

export type StoryAngle =
  | 'RIVALRY'
  | 'PLAYER'
  | 'HISTORICAL'
  | 'FORM'
  | 'RECORD'
  | 'RISING_STAR'
  | 'STAKES'
  | 'CURIOSITY';

const ALL_ANGLES: StoryAngle[] = [
  'RIVALRY',
  'PLAYER',
  'HISTORICAL',
  'FORM',
  'RECORD',
  'RISING_STAR',
  'STAKES',
  'CURIOSITY',
];

export type DiscoveryEvent = {
  id: string;
  sport: string;
  sportLabel: string | null;
  competition: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  round: string | null;
  startsAt: Date;
  isDerby: boolean;
  isFinal: boolean;
  prestige: boolean;
};

export type DiscoveryUser = {
  id: string;
  firstName: string | null;
  followedTeams: string[];
  followedCompetitions: string[];
  followedSports: string[];
};

export type DiscoveryContext = {
  event: DiscoveryEvent;
  user: DiscoveryUser;
  horizon: DiscoveryHorizon;
  /** Angles already used in today's briefing for this user — diversity guard */
  usedAngles: StoryAngle[];
  /** Titles of any previous discovery pushes for this same event, in order */
  previousChapters: string[];
  /** Deterministic seed for template selection */
  seed: string;
};

export type DiscoveryCandidateCopy = {
  title: string;
  body: string;
  angle: StoryAngle;
  source: 'llm' | 'template';
  score: number;
};

export type DiscoveryPick = {
  chosen: { title: string; body: string; angle: StoryAngle; source: 'llm' | 'template' };
  candidates: DiscoveryCandidateCopy[];
  aiGenerated: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

const BLOCKED = /https?:\/\/|www\.|@\w+|(fuck|shit|damn)\b/i;

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validCopy(t: string, b: string): { title: string; body: string } | null {
  const title = truncate(t, 60); // slightly longer than storyline (allowed by spec 40-100)
  const body = truncate(b, 140);
  if (!title || !body) return null;
  if (BLOCKED.test(title) || BLOCKED.test(body)) return null;
  return { title, body };
}

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* -------------------------------------------------------------------------- */
/*  Template floor — one pool per (horizon, event shape).                      */
/*  Placeholders: {home} {away} {competition} {round} {sport}                  */
/* -------------------------------------------------------------------------- */

type Tmpl = { title: string; body: string; angle: StoryAngle };

const HORIZON_LABEL: Record<DiscoveryHorizon, string> = {
  TOMORROW: 'Tomorrow',
  DAY_AFTER: 'In two days',
  THIS_WEEK: 'This week',
  THIS_WEEKEND: 'This weekend',
  NEXT_WEEK: 'Next week',
};

const TEMPLATES: Record<DiscoveryHorizon, Record<'team' | 'derby' | 'f1' | 'generic', Tmpl[]>> = {
  TOMORROW: {
    team: [
      { title: 'Tomorrow: {home} vs {away}', body: 'Who takes the spotlight this time?', angle: 'CURIOSITY' },
      { title: '{home} vs {away} — tomorrow', body: 'One to watch. Set the reminder.', angle: 'STAKES' },
    ],
    derby: [
      { title: 'Derby energy — tomorrow', body: '{home} vs {away}. You know how this goes.', angle: 'RIVALRY' },
    ],
    f1: [
      { title: '{round} — tomorrow', body: 'Lights out. Who writes the headline?', angle: 'CURIOSITY' },
    ],
    generic: [
      { title: 'One to watch tomorrow', body: '{competition}. Worth carving out the time.', angle: 'CURIOSITY' },
    ],
  },
  DAY_AFTER: {
    team: [
      { title: 'Two days out: {home} vs {away}', body: 'Something to look forward to.', angle: 'CURIOSITY' },
      { title: '{home} vs {away} — 48 hours', body: 'The build-up is half the fun.', angle: 'STAKES' },
    ],
    derby: [
      { title: 'Two days to bragging rights', body: '{home} vs {away}. Bring popcorn.', angle: 'RIVALRY' },
    ],
    f1: [
      { title: 'Grid takes shape in 48h', body: '{round}. Storylines waiting to unfold.', angle: 'CURIOSITY' },
    ],
    generic: [
      { title: 'Coming up in two days', body: '{competition}. You’ll want to be around.', angle: 'CURIOSITY' },
    ],
  },
  THIS_WEEK: {
    team: [
      { title: 'One to watch this week', body: '{home} vs {away}{compSuffix}. Should be interesting.', angle: 'CURIOSITY' },
      { title: '{home} have a test coming', body: 'They face {away}{compSuffix} later this week.', angle: 'FORM' },
    ],
    derby: [
      { title: 'A rivalry is heating up', body: '{home} vs {away} lands this week.', angle: 'RIVALRY' },
    ],
    f1: [
      { title: 'F1 lands this week', body: '{round}. Who’s about to make a move?', angle: 'CURIOSITY' },
    ],
    generic: [
      { title: 'This week could get spicy', body: '{competition}. Keep an eye on it.', angle: 'CURIOSITY' },
    ],
  },
  THIS_WEEKEND: {
    team: [
      { title: '{home} vs {away} — this weekend', body: 'Weekend plans just got sorted.', angle: 'STAKES' },
      { title: 'Weekend headline forming', body: '{home} vs {away}{compSuffix}. Who owns the spotlight?', angle: 'CURIOSITY' },
    ],
    derby: [
      { title: 'Weekend is going to be loud', body: '{home} vs {away}. Rivalry never sleeps.', angle: 'RIVALRY' },
    ],
    f1: [
      { title: '{round} this weekend', body: 'Lights out. Could history repeat itself?', angle: 'HISTORICAL' },
    ],
    generic: [
      { title: 'Your weekend just got interesting', body: '{competition}. Worth blocking off time.', angle: 'CURIOSITY' },
    ],
  },
  NEXT_WEEK: {
    team: [
      { title: 'Coming next week: {home} vs {away}', body: 'Something to circle on the calendar.', angle: 'CURIOSITY' },
    ],
    derby: [
      { title: 'Next week: {home} vs {away}', body: 'Rivalry incoming. Save the date.', angle: 'RIVALRY' },
    ],
    f1: [
      { title: '{round} — next week', body: 'Bigger picture is starting to form.', angle: 'CURIOSITY' },
    ],
    generic: [
      { title: 'Circle this on the calendar', body: '{competition} next week.', angle: 'CURIOSITY' },
    ],
  },
};

function pickTemplate(horizon: DiscoveryHorizon, event: DiscoveryEvent, seed: string): Tmpl {
  const family =
    event.sport === 'f1'
      ? TEMPLATES[horizon].f1
      : event.homeTeam && event.awayTeam
        ? event.isDerby
          ? TEMPLATES[horizon].derby
          : TEMPLATES[horizon].team
        : TEMPLATES[horizon].generic;
  const idx = hash(`${seed}:${horizon}`) % family.length;
  return family[idx]!;
}

function renderTemplate(tmpl: Tmpl, event: DiscoveryEvent): { title: string; body: string } {
  const compSuffix = event.competition ? ` (${event.competition})` : '';
  const vars: Record<string, string> = {
    home: event.homeTeam ?? '',
    away: event.awayTeam ?? '',
    competition: event.competition ?? '',
    round: event.round ?? event.competition ?? 'the event',
    sport: event.sportLabel ?? event.sport,
    compSuffix,
  };
  const replace = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  return { title: replace(tmpl.title).trim(), body: replace(tmpl.body).trim() };
}

/* -------------------------------------------------------------------------- */
/*  Anthropic                                                                  */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = [
  'You are Kairos, a sports storyteller writing "upcoming events" push notifications.',
  '',
  'Voice: catchy, curious, energetic, sports-native, slightly provocative. Human, never corporate.',
  'The reader should feel like a personal sports editor is texting them.',
  'Every notification should carry an EVENT + a STORY + a CURIOSITY hook.',
  '',
  'You will receive one upcoming event, plus the recipient user\'s profile (followed teams,',
  'sports, competitions, first name if known), a time horizon, angles the user has ALREADY',
  'seen in today\'s briefing, and any previous chapter titles for this same event.',
  '',
  'Produce 8 candidates. Each candidate MUST be tagged with one of these story angles:',
  '  RIVALRY       — head-to-head history, derbies, classicos',
  '  PLAYER        — a specific player\'s form or status (only if named in context)',
  '  HISTORICAL    — a real historical parallel (only if provided in context)',
  '  FORM          — recent form (only if provided in context)',
  '  RECORD        — a record that could fall (only if provided in context)',
  '  RISING_STAR   — a specific young player (only if named in context)',
  '  STAKES        — table / championship implications',
  '  CURIOSITY     — a pure question / anticipation hook — safest fallback',
  '',
  'Cover at least 4 different angles across the 8 candidates. Avoid angles listed in',
  'usedAngles when possible — they were already sent to this user earlier today.',
  '',
  'HARD RULES:',
  '  - Use ONLY facts in `event`. Never invent players, stats, records, injuries, quotes,',
  '    or historical claims. If a fact isn\'t supplied, use the CURIOSITY angle.',
  '  - Do NOT repeat or paraphrase any title in `previousChapters` or `recentTitles`.',
  '  - title  ≤ 55 characters. body ≤ 130 characters.',
  '  - No emojis unless the sport uses them by default. No ALL CAPS. No trailing punctuation on titles.',
  '  - No URLs, no hashtags, no @-mentions.',
  '',
  'OUTPUT: return ONLY a JSON object matching this exact schema. No prose, no code fences.',
  '{',
  '  "candidates": [',
  '    { "title": "...", "body": "...", "angle": "RIVALRY|PLAYER|HISTORICAL|FORM|RECORD|RISING_STAR|STAKES|CURIOSITY" }',
  '  ]',
  '}',
].join('\n');

async function recentTitles(userId: string, limit = 12): Promise<string[]> {
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

async function callAnthropic(
  ctx: DiscoveryContext,
): Promise<Array<{ title: string; body: string; angle: StoryAngle }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return [];

  let Anthropic: typeof import('@anthropic-ai/sdk').default;
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default;
  } catch {
    return [];
  }
  const client = new Anthropic({ apiKey });

  const recent = await recentTitles(ctx.user.id, 12);

  const payload = {
    horizon: ctx.horizon,
    event: {
      sport: ctx.event.sportLabel ?? ctx.event.sport,
      competition: ctx.event.competition,
      homeTeam: ctx.event.homeTeam,
      awayTeam: ctx.event.awayTeam,
      round: ctx.event.round,
      startsAtISO: ctx.event.startsAt.toISOString(),
      isDerby: ctx.event.isDerby,
      isFinal: ctx.event.isFinal,
      prestige: ctx.event.prestige,
    },
    user: {
      firstName: ctx.user.firstName,
      followedTeams: ctx.user.followedTeams.slice(0, 8),
      followedCompetitions: ctx.user.followedCompetitions.slice(0, 8),
      followedSports: ctx.user.followedSports,
    },
    usedAngles: ctx.usedAngles,
    previousChapters: ctx.previousChapters,
    recentTitles: recent,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await client.messages.create(
      {
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        temperature: 0.9,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Write the discovery push candidates. Context:\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      },
      { signal: controller.signal, maxRetries: 1 },
    );
    clearTimeout(timeout);

    const block = res.content.find((c) => c.type === 'text');
    if (!block || block.type !== 'text') return [];
    const raw = block.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
    const parsed = JSON.parse(raw) as {
      candidates?: Array<{ title?: unknown; body?: unknown; angle?: unknown }>;
    };
    return (parsed.candidates ?? [])
      .filter(
        (c): c is { title: string; body: string; angle: StoryAngle } =>
          typeof c?.title === 'string' &&
          typeof c?.body === 'string' &&
          typeof c?.angle === 'string' &&
          (ALL_ANGLES as string[]).includes(c.angle),
      );
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[discovery.anthropic.fallback]', {
      eventId: ctx.event.id,
      userId: ctx.user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*  Local scoring                                                              */
/* -------------------------------------------------------------------------- */

function scoreCandidate(
  c: { title: string; body: string; angle: StoryAngle; source: 'llm' | 'template' },
  ctx: {
    usedAngles: Set<StoryAngle>;
    forbiddenTitles: Set<string>;
    prevChapterTitles: string[];
  },
): number {
  let s = 100;

  const tl = c.title.length;
  if (tl < 12) s -= 25;
  else if (tl > 55) s -= 30;

  const bl = c.body.length;
  if (bl < 20) s -= 15;
  else if (bl > 130) s -= 30;

  if (c.source === 'llm') s += 10;

  // Angle diversity — pushes on angles already used today are penalised.
  if (ctx.usedAngles.has(c.angle)) s -= 25;

  const norm = normalize(c.title);
  if (ctx.forbiddenTitles.has(norm)) return -1;
  for (const prev of ctx.prevChapterTitles) {
    const p = normalize(prev);
    if (p && norm.includes(p.slice(0, 8))) s -= 25;
  }

  // Curiosity hooks (a "?" or ":") add a small bonus.
  if (/[?]$/.test(c.title) || /:\s/.test(c.title)) s += 4;

  return s;
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                         */
/* -------------------------------------------------------------------------- */

export async function generateDiscoveryPush(
  ctx: DiscoveryContext,
): Promise<DiscoveryPick | null> {
  const llmCandidates = await callAnthropic(ctx);
  const recent = new Set((await recentTitles(ctx.user.id, 12)).map(normalize));
  const usedAngles = new Set(ctx.usedAngles);

  const forbidden = new Set<string>([
    ...recent,
    ...ctx.previousChapters.map(normalize),
  ]);

  const scored: DiscoveryCandidateCopy[] = [];

  for (const c of llmCandidates) {
    const safe = validCopy(c.title, c.body);
    if (!safe) continue;
    const item: DiscoveryCandidateCopy = {
      ...safe,
      angle: c.angle,
      source: 'llm',
      score: 0,
    };
    item.score = scoreCandidate(item, {
      usedAngles,
      forbiddenTitles: forbidden,
      prevChapterTitles: ctx.previousChapters,
    });
    if (item.score >= 0) scored.push(item);
  }

  // Always mix in the template as a floor.
  const tmpl = pickTemplate(ctx.horizon, ctx.event, ctx.seed);
  const rendered = renderTemplate(tmpl, ctx.event);
  const tmplSafe = validCopy(rendered.title, rendered.body);
  if (tmplSafe) {
    const item: DiscoveryCandidateCopy = {
      ...tmplSafe,
      angle: tmpl.angle,
      source: 'template',
      score: 0,
    };
    item.score = scoreCandidate(item, {
      usedAngles,
      forbiddenTitles: forbidden,
      prevChapterTitles: ctx.previousChapters,
    });
    scored.push(item);
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.source !== b.source) return a.source === 'llm' ? -1 : 1;
    return Math.abs(a.title.length - 35) - Math.abs(b.title.length - 35);
  });

  const chosen = scored[0]!;
  return {
    chosen: {
      title: chosen.title,
      body: chosen.body,
      angle: chosen.angle,
      source: chosen.source,
    },
    candidates: scored,
    aiGenerated: chosen.source === 'llm',
  };
}
