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
  /** Top scorers in recent matches for either team (from MatchEvent data) */
  recentScorers?: string[];
  /** Key player names (top scorer of the season, etc.) */
  keyPlayers?: { home?: string; away?: string };
  /** Team form strings like "WWDLW" */
  form?: { home?: string; away?: string };
  /** Last H2H result if available */
  lastH2H?: string;
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
/*  Placeholders: {home} {away} {competition} {round} {name} {scorer}         */
/*                {formHint} {mins} {compSuffix}                               */
/* -------------------------------------------------------------------------- */

type Tmpl = { title: string; body: string };

const T = {
  morning_teaser: {
    team: [
      { title: '{home} vs {away} tonight', body: 'Ready for another chapter?' },
      { title: '{competition}: {home} vs {away}', body: 'The day has a headline. Who writes it?' },
      { title: 'Tonight \u2014 {home} vs {away}', body: "You'll want to be near a screen." },
      { title: '{home} vs {away} \u2014 later today', body: "Some fixtures don't need hype. This one does." },
      { title: 'Heads up, {name}', body: '{home} vs {away} tonight. Your evening just got interesting.' },
      { title: '{name}, clear your schedule', body: "{home} vs {away} later. You'll regret missing this." },
      { title: '{home} vs {away} tonight', body: '{scorer} has been on fire. Will the streak continue?' },
      { title: '{away} come to town', body: '{home} host {away} tonight. {formHint}' },
    ],
    derby: [
      { title: 'Derby day: {home} vs {away}', body: 'Everyone will have an opinion by full time.' },
      { title: "It's on tonight", body: "{home} vs {away}. Rivalries don't need reminders \u2014 but here's one." },
      { title: "{name}, it's derby day", body: '{home} vs {away}. Friendships will be tested tonight.' },
      { title: 'Hide the group chat', body: '{home} vs {away} derby tonight. Things are about to get loud.' },
    ],
    f1: [
      { title: '{round} today', body: "Grid's set. Storylines waiting to unfold." },
      { title: 'Lights out later', body: '{round} \u2014 worth the coffee break.' },
      { title: '{name}, engines warm today', body: '{round}. Pick your winner before lights out.' },
    ],
    generic: [
      { title: 'Big one today', body: "{competition}. You'll want to know how this ends." },
      { title: "Today's the day", body: "{competition}. Set an alarm you won't need." },
      { title: '{name}, got plans tonight?', body: '{competition} might change them.' },
    ],
  },
  midday_hype: {
    team: [
      { title: 'A few hours to go', body: '{home} vs {away}. The build-up is half the fun.' },
      { title: 'Half a day out', body: 'Two sides, one storyline: {home} vs {away}.' },
      { title: 'The main event is close', body: '{home} vs {away}{compSuffix}. Feel the tempo shift?' },
      { title: '{name}, the clock is ticking', body: "{home} vs {away} in a few hours. Who's your pick?" },
      { title: 'Prediction time, {name}', body: '{home} vs {away}. Drop your scoreline guess. No pressure.' },
      { title: 'Can {scorer} do it again?', body: '{home} vs {away} tonight. Form says yes, football says maybe.' },
    ],
    derby: [
      { title: "Feel that? It's derby energy", body: '{home} vs {away}. Nothing else matters tonight.' },
      { title: 'Countdown to bragging rights', body: '{home} vs {away}. Nobody sleeps easy after this.' },
      { title: 'Social media is warming up', body: '{home} vs {away}. The real match is already in the replies.' },
    ],
    f1: [
      { title: "Grid's taking shape", body: "{round}. Who's about to stake a claim?" },
      { title: 'A few hours to lights out', body: "{round}. Who writes today's headline?" },
      { title: '{name}, made your prediction?', body: '{round}. Podium picks before formation lap?' },
    ],
    generic: [
      { title: 'Halfway there', body: '{competition}. The stakes are quietly stacking up.' },
      { title: 'The tension is building', body: '{competition}. Ready to lean in?' },
    ],
  },
  pre_event: {
    team: [
      { title: '{home} vs {away} \u2014 {mins}m to go', body: "Grab a seat. It's time." },
      { title: '{mins} minutes to kickoff', body: '{home} vs {away}{compSuffix}. Ready?' },
      { title: 'Almost there', body: '{home} vs {away} in {mins} minutes. This is your reminder.' },
      { title: '{name}, {mins}m to kickoff', body: "{home} vs {away}. Whatever you're doing, this is better." },
      { title: 'Phone down in {mins}m', body: "{home} vs {away} is about to start. Actually, keep it \u2014 you'll need scores." },
      { title: '{home} vs {away} in {mins}m', body: '{scorer} starts. The rest is unscripted.' },
    ],
    derby: [
      { title: 'Derby time \u2014 {mins}m', body: '{home} vs {away}. Ninety minutes decide everything.' },
      { title: '{mins}m to the big one', body: '{home} vs {away}. Deep breath.' },
      { title: "{name}, it's almost time", body: '{home} vs {away} in {mins}m. This is what we live for.' },
    ],
    f1: [
      { title: '{round} \u2014 {mins}m to lights out', body: 'Grid is forming.' },
      { title: 'Lights out in {mins}', body: '{round}. Here we go.' },
      { title: '{name}, lights out in {mins}m', body: '{round}. Phones on silent, eyes on the grid.' },
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
  const compSuffix = event.competition ? ` \u00B7 ${event.competition}` : '';
  const scorer = event.recentScorers?.[0]
    ?? event.keyPlayers?.home
    ?? event.keyPlayers?.away
    ?? '';
  const formHint = buildFormHint(event);
  const vars: Record<string, string> = {
    home: event.homeTeam ?? '',
    away: event.awayTeam ?? '',
    competition: event.competition ?? '',
    round: event.round ?? event.competition ?? 'the event',
    name: user.firstName ?? 'friend',
    mins: String(Math.max(1, Math.round(minsUntilStart))),
    compSuffix,
    scorer,
    formHint,
  };
  const replace = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  let title = replace(tmpl.title).trim();
  let body = replace(tmpl.body).trim();
  // If a template used {scorer} but we had no scorer, strip the empty reference
  if (!scorer && (title.includes('  ') || body.includes('  '))) {
    title = title.replace(/\s{2,}/g, ' ').trim();
    body = body.replace(/\s{2,}/g, ' ').trim();
  }
  return { title, body };
}

function buildFormHint(event: StoryEvent): string {
  if (!event.form?.home && !event.form?.away) return 'Form guide loading\u2026';
  const parts: string[] = [];
  if (event.form?.home && event.homeTeam) {
    parts.push(`${event.homeTeam}: ${event.form.home}`);
  }
  if (event.form?.away && event.awayTeam) {
    parts.push(`${event.awayTeam}: ${event.form.away}`);
  }
  return parts.join(' | ') || 'Should be a good one.';
}

/* -------------------------------------------------------------------------- */
/*  Anthropic call                                                            */
/* -------------------------------------------------------------------------- */

type LlmStagePayload = { candidates: Array<{ title: string; body: string }> };
type LlmResponse = { stages: Partial<Record<StoryStage, LlmStagePayload>> };

const SYSTEM_PROMPT = [
  'You are Kairos, a sports-obsessed friend writing mobile push notifications.',
  '',
  'PERSONALITY: witty, warm, slightly cheeky. Like a friend who texts you before a big match.',
  'Think: "your best mate who somehow knows every fixture". Subtle humor, not cringe.',
  'Never sound like a calendar app, a corporate brand, or a betting site.',
  'Notifications must make the reader think: "Ha, okay yeah I need to watch this."',
  '',
  'PERSONALIZATION TOOLS:',
  "  - Use the user's first name naturally (not every notification \u2014 about 40% of them).",
  '    Good: "{name}, this one\'s going to be spicy" / Bad: "Hey {name}! Don\'t miss this!!"',
  '  - When recentScorers or keyPlayers are provided, weave player names into the hook.',
  '    Good: "Salah\'s been scoring for fun. Can anyone stop him tonight?"',
  '    Bad: "Mohamed Salah will play in the match today."',
  '  - When form data is provided, use it for narrative tension.',
  '    Good: "3 wins in a row. {home} are buzzing." / Bad: "Form: WWWDL"',
  "  - When it's a derby, lean into the rivalry energy. Friendly trash talk is welcome.",
  '',
  'You will write a 3-chapter push STORYLINE across three stages:',
  '',
  '  MORNING_TEASER  \u2014 plant the seed. Make them think about it all day.',
  '  MIDDAY_HYPE     \u2014 build the narrative. Ask questions, tease storylines.',
  '  PRE_EVENT       \u2014 ~15 min out. Urgent but clever. "Drop everything" energy.',
  '',
  'HARD RULES:',
  '  - Use ONLY facts from `context`. You may reference recentScorers and keyPlayers',
  '    BY NAME. Never invent other player names, stats, records, or quotes.',
  "  - Don't repeat phrasing across stages. Each chapter is distinct.",
  '  - title \u2264 45 chars. body \u2264 120 chars.',
  '  - No emojis. No ALL CAPS. No URLs, hashtags, or @-mentions.',
  '  - No trailing punctuation on titles.',
  '  - Subtle humor \u2014 think wry observation, not dad jokes.',
  '',
  'OUTPUT: return ONLY a JSON object. No prose, no code fences.',
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
      recentScorers: ctx.event.recentScorers?.slice(0, 5) ?? [],
      keyPlayers: ctx.event.keyPlayers ?? {},
      form: ctx.event.form ?? {},
      lastH2H: ctx.event.lastH2H ?? null,
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
