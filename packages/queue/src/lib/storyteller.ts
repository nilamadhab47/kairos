/**
 * Multi-stage push storyteller.
 *
 * Generates a 3-chapter storyline (morning_teaser → midday_hype → pre_event)
 * for a single upcoming sports event, in ONE Anthropic call.
 *
 * Why one call, not three:
 *   - Cost: ~1/3 the tokens.
 *   - Continuity: asking for "3 chapters of one story" produces natural
 *     escalation. Asking three times produces three variants of the same idea.
 *
 * Anthropic returns N candidates per stage. We then run a deterministic
 * local scorer to pick the strongest per stage, dedup against the previous
 * chapter's phrasing, and validate length / no-URLs / etc. Everything the
 * LLM produced (chosen + rejected) is persisted on the Notification row so
 * we can inspect / rebalance the scoring later.
 *
 * Failure modes ALL fall back to a curated per-stage template pool so
 * scheduling never depends on Anthropic availability.
 */

import { prisma } from '@kairo/db';

/* -------------------------------------------------------------------------- */

export type StoryStage = 'morning_teaser' | 'midday_hype' | 'pre_event';

const ALL_STAGES: StoryStage[] = ['morning_teaser', 'midday_hype', 'pre_event'];

export type StoryEvent = {
  id: string;
  sport: string;
  sportLabel: string | null;
  competition: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  round: string | null;
  venue: string | null;
  startsAt: Date;
  isDerby: boolean;
  isFinal: boolean;
  prestige: boolean;
};

export type StoryUser = {
  id: string;
  firstName: string | null;
  followedTeams: string[];
  followedCompetitions: string[];
  followedSports: string[];
};

export type StoryContext = {
  event: StoryEvent;
  user: StoryUser;
  stages: StoryStage[]; // which stages we want copy for
  /** deterministic seed for template selection when LLM is skipped */
  seed: string;
};

export type StoryCandidate = {
  title: string;
  body: string;
  source: 'llm' | 'template';
  /** local score after validation — higher is better */
  score: number;
};

export type StoryChapter = {
  stage: StoryStage;
  chosen: { title: string; body: string; source: 'llm' | 'template' };
  candidates: StoryCandidate[];
  /** true if the LLM successfully produced the chosen candidate */
  aiGenerated: boolean;
};

export type Storyline = Record<StoryStage, StoryChapter | null>;

/* -------------------------------------------------------------------------- */
/*  Validation + normalization                                                */
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

function validCandidate(t: string, b: string): { title: string; body: string } | null {
  const title = truncate(t, 45);
  const body = truncate(b, 120);
  if (!title || !body) return null;
  if (BLOCKED.test(title) || BLOCKED.test(body)) return null;
  return { title, body };
}

/**
 * Deterministic hash — used to pick a template when the LLM is off / fails.
 */
function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* -------------------------------------------------------------------------- */
/*  Template floor — one pool per (stage, event shape).                        */
/*  Placeholders: {home} {away} {competition} {round} {name}                   */
/* -------------------------------------------------------------------------- */

type Tmpl = { title: string; body: string };

const T = {
  morning_teaser: {
    team: [
      { title: '{home} vs {away} tonight', body: 'Ready for another chapter?' },
      { title: '{competition}: {home} vs {away}', body: 'The day has a headline. Who writes it?' },
      { title: 'Tonight — {home} vs {away}', body: 'You’ll want to be near a screen.' },
      { title: '{home} vs {away} — later today', body: 'Some fixtures don’t need hype. This one does.' },
    ],
    derby: [
      { title: 'Derby day: {home} vs {away}', body: 'Everyone will have an opinion by full time.' },
      { title: 'It’s on tonight', body: '{home} vs {away}. Rivalries don’t need reminders — but here’s one.' },
    ],
    f1: [
      { title: '{round} today', body: 'Grid’s set. Storylines waiting to unfold.' },
      { title: 'Lights out later', body: '{round} — worth the coffee break.' },
    ],
    generic: [
      { title: 'Big one today', body: '{competition}. You’ll want to know how this ends.' },
      { title: 'Today’s the day', body: '{competition}. Set an alarm you won’t need.' },
    ],
  },
  midday_hype: {
    team: [
      { title: 'A few hours to go', body: '{home} vs {away}. The build-up is half the fun.' },
      { title: 'Half a day out', body: 'Two sides, one storyline: {home} vs {away}.' },
      { title: 'The main event is close', body: '{home} vs {away}{compSuffix}. Feel the tempo shift?' },
    ],
    derby: [
      { title: 'Feel that? It’s derby energy', body: '{home} vs {away}. Nothing else matters tonight.' },
      { title: 'Countdown to bragging rights', body: '{home} vs {away}. Nobody sleeps easy after this.' },
    ],
    f1: [
      { title: 'Grid’s taking shape', body: '{round}. Who’s about to stake a claim?' },
      { title: 'A few hours to lights out', body: '{round}. Who writes today’s headline?' },
    ],
    generic: [
      { title: 'Halfway there', body: '{competition}. The stakes are quietly stacking up.' },
      { title: 'The tension is building', body: '{competition}. Ready to lean in?' },
    ],
  },
  pre_event: {
    team: [
      { title: '{home} vs {away} — {mins}m to go', body: 'Grab a seat. It’s time.' },
      { title: '{mins} minutes to kickoff', body: '{home} vs {away}{compSuffix}. Ready?' },
      { title: 'Almost there', body: '{home} vs {away} in {mins} minutes. This is your reminder.' },
    ],
    derby: [
      { title: 'Derby time — {mins}m', body: '{home} vs {away}. Ninety minutes decide everything.' },
      { title: '{mins}m to the big one', body: '{home} vs {away}. Deep breath.' },
    ],
    f1: [
      { title: '{round} — {mins}m to lights out', body: 'Grid is forming.' },
      { title: 'Lights out in {mins}', body: '{round}. Here we go.' },
    ],
    generic: [
      { title: 'Starting in {mins}m', body: '{competition}. Time to tune in.' },
      { title: '{mins}m warning', body: '{competition}. Almost there.' },
    ],
  },
} satisfies Record<StoryStage, Record<'team' | 'derby' | 'f1' | 'generic', Tmpl[]>>;

function pickTemplate(
  stage: StoryStage,
  event: StoryEvent,
  seed: string,
): Tmpl {
  const family =
    event.sport === 'f1'
      ? T[stage].f1
      : event.homeTeam && event.awayTeam
        ? event.isDerby
          ? T[stage].derby
          : T[stage].team
        : T[stage].generic;
  const idx = hash(`${seed}:${stage}`) % family.length;
  return family[idx]!;
}

function renderTemplate(
  tmpl: Tmpl,
  event: StoryEvent,
  user: StoryUser,
  minsUntilStart: number,
): { title: string; body: string } {
  const compSuffix = event.competition ? ` · ${event.competition}` : '';
  const vars: Record<string, string> = {
    home: event.homeTeam ?? '',
    away: event.awayTeam ?? '',
    competition: event.competition ?? '',
    round: event.round ?? event.competition ?? 'the event',
    name: user.firstName ?? '',
    mins: String(Math.max(1, Math.round(minsUntilStart))),
    compSuffix,
  };
  const replace = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  return { title: replace(tmpl.title).trim(), body: replace(tmpl.body).trim() };
}

/* -------------------------------------------------------------------------- */
/*  Anthropic call                                                            */
/* -------------------------------------------------------------------------- */

type LlmStagePayload = { candidates: Array<{ title: string; body: string }> };
type LlmResponse = { stages: Partial<Record<StoryStage, LlmStagePayload>> };

const SYSTEM_PROMPT = [
  'You are Kairos, a sports storyteller writing mobile push notifications.',
  '',
  'Voice: catchy, curious, energetic, sports-native, slightly provocative. Human, never corporate.',
  'Never sound like a calendar reminder. Notifications must make the reader think:',
  '  "Wait… I want to know what happens."',
  '',
  'You will be given a single upcoming sports event and asked to write a 3-chapter push',
  'STORYLINE across three stages. Read them as chapters of one story — do NOT repeat',
  'phrasing or nouns across stages. Each stage has its own job:',
  '',
  '  MORNING_TEASER  — earlier in the day. Create anticipation. A hint, not a headline.',
  '  MIDDAY_HYPE     — a few hours out. Introduce a storyline / question / rivalry hook.',
  '                    Zero fabrication. If you don’t have real facts, ask a question.',
  '  PRE_EVENT       — ~15 minutes out. Direct but still with a hook.',
  '',
  'HARD RULES:',
  '  - Use ONLY the facts in `context`. Never invent player names, stats, records,',
  '    injuries, quotes, or historical claims. If context is thin, write a pure',
  '    curiosity hook based on what IS given.',
  '  - Respect the recentTitlesUserHasSeen list — do not repeat or paraphrase.',
  '  - title  ≤ 45 characters. body ≤ 120 characters.',
  '  - No emojis unless the sport uses them by default. No ALL CAPS.',
  '  - No URLs, no hashtags, no @-mentions. No trailing punctuation on titles.',
  '',
  'OUTPUT: return ONLY a JSON object matching this exact schema. No prose, no code fences.',
  '{',
  '  "stages": {',
  '    "morning_teaser": { "candidates": [{"title":"...","body":"..."}, ...] },',
  '    "midday_hype":    { "candidates": [{"title":"...","body":"..."}, ...] },',
  '    "pre_event":      { "candidates": [{"title":"...","body":"..."}, ...] }',
  '  }',
  '}',
  '',
  'Produce 4 candidates per stage. Omit any stage the request does not include.',
].join('\n');

async function recentTitlesForUser(userId: string, limit = 8): Promise<string[]> {
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
  ctx: StoryContext,
): Promise<Partial<Record<StoryStage, LlmStagePayload>>> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return {};

  let Anthropic: typeof import('@anthropic-ai/sdk').default;
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default;
  } catch {
    return {};
  }
  const client = new Anthropic({ apiKey });

  const recentTitles = await recentTitlesForUser(ctx.user.id);

  const payload = {
    stages: ctx.stages,
    event: {
      sport: ctx.event.sportLabel ?? ctx.event.sport,
      competition: ctx.event.competition,
      homeTeam: ctx.event.homeTeam,
      awayTeam: ctx.event.awayTeam,
      round: ctx.event.round,
      venue: ctx.event.venue,
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
    recentTitlesUserHasSeen: recentTitles,
  };

  const userMsg = `Write the storyline. Context:\n${JSON.stringify(payload, null, 2)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await client.messages.create(
      {
        model: 'claude-haiku-4-5',
        max_tokens: 900,
        temperature: 0.9,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      },
      { signal: controller.signal, maxRetries: 1 },
    );
    clearTimeout(timeout);

    const block = res.content.find((c) => c.type === 'text');
    if (!block || block.type !== 'text') return {};
    const raw = block.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
    const parsed = JSON.parse(raw) as LlmResponse;
    return parsed.stages ?? {};
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[storyteller.anthropic.fallback]', {
      eventId: ctx.event.id,
      userId: ctx.user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/*  Local scoring & selection                                                 */
/* -------------------------------------------------------------------------- */

function scoreCandidate(
  cand: { title: string; body: string; source: 'llm' | 'template' },
  ctx: {
    forbiddenTitles: Set<string>;
    recentTitles: Set<string>;
    /** longest previous chapter title (dedupe against it) */
    prevChapterTitles: string[];
  },
): number {
  let s = 100;

  // Length sweet spots.
  const tl = cand.title.length;
  if (tl < 12) s -= 20;
  else if (tl > 45) s -= 30;
  else if (tl > 38) s -= 5;

  const bl = cand.body.length;
  if (bl < 20) s -= 15;
  else if (bl > 120) s -= 30;

  // Prefer LLM output when it exists and passes; templates are the floor.
  if (cand.source === 'llm') s += 10;

  // Penalise verbatim dupes of prior stage titles.
  const norm = normalize(cand.title);
  if (ctx.forbiddenTitles.has(norm)) return -1;
  if (ctx.recentTitles.has(norm)) s -= 40;
  for (const prev of ctx.prevChapterTitles) {
    const p = normalize(prev);
    // 8-char overlap = almost certainly the same phrase.
    if (p && norm.includes(p.slice(0, 8))) s -= 20;
  }

  // Bonus for a curiosity signal — a question mark or a colon-hook.
  if (/[?]$/.test(cand.title) || /:\s/.test(cand.title)) s += 5;

  return s;
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                        */
/* -------------------------------------------------------------------------- */

export async function generateStoryline(
  ctx: StoryContext,
  minsUntilByStage: Record<StoryStage, number>,
): Promise<Storyline> {
  const llmStages = await callAnthropic(ctx);

  const recentTitles = new Set(
    (await recentTitlesForUser(ctx.user.id, 12)).map(normalize),
  );
  const prevChapterTitles: string[] = [];
  const forbidden = new Set<string>();

  const result: Storyline = {
    morning_teaser: null,
    midday_hype: null,
    pre_event: null,
  };

  // Iterate in chronological order so later chapters can dedupe against earlier ones.
  for (const stage of ALL_STAGES) {
    if (!ctx.stages.includes(stage)) continue;

    const candidates: StoryCandidate[] = [];

    // LLM candidates (validated).
    const llm = llmStages[stage];
    if (llm?.candidates) {
      for (const c of llm.candidates) {
        if (typeof c?.title !== 'string' || typeof c?.body !== 'string') continue;
        const safe = validCandidate(c.title, c.body);
        if (!safe) continue;
        const scored: StoryCandidate = {
          ...safe,
          source: 'llm',
          score: 0,
        };
        scored.score = scoreCandidate(scored, {
          forbiddenTitles: forbidden,
          recentTitles,
          prevChapterTitles,
        });
        if (scored.score >= 0) candidates.push(scored);
      }
    }

    // Always mix in the template as a floor.
    const tmpl = pickTemplate(stage, ctx.event, ctx.seed);
    const renderedTmpl = renderTemplate(
      tmpl,
      ctx.event,
      ctx.user,
      minsUntilByStage[stage],
    );
    const tmplSafe = validCandidate(renderedTmpl.title, renderedTmpl.body);
    if (tmplSafe) {
      const scored: StoryCandidate = {
        ...tmplSafe,
        source: 'template',
        score: 0,
      };
      scored.score = scoreCandidate(scored, {
        forbiddenTitles: forbidden,
        recentTitles,
        prevChapterTitles,
      });
      candidates.push(scored);
    }

    // Rank descending. Break ties: LLM first, then title length closer to 30.
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.source !== b.source) return a.source === 'llm' ? -1 : 1;
      return Math.abs(a.title.length - 30) - Math.abs(b.title.length - 30);
    });

    const chosen = candidates[0];
    if (!chosen) continue;

    result[stage] = {
      stage,
      chosen: { title: chosen.title, body: chosen.body, source: chosen.source },
      candidates,
      aiGenerated: chosen.source === 'llm',
    };

    prevChapterTitles.push(chosen.title);
    forbidden.add(normalize(chosen.title));
  }

  return result;
}
