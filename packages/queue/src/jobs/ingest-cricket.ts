/**
 * Cricket ingest job — India-first (issue #38).
 *
 * 1. Global upcoming + live via sports router (Cricbuzz primary).
 * 2. Deliberate series pulls for India-relevant competitions:
 *    India tours, IPL/WPL, Ranji, Duleep, Vijay Hazare, SMAT, etc.
 *
 * Data rule: real provider data only. Never fabricate fixtures.
 */

import { CricbuzzProvider, sportsRouter, upsertMatches } from '@kairo/sports';
import type { NormalizedMatch, UpsertBatchResult } from '@kairo/sports';

const INDIA_HINTS = [
  'india',
  'ipl',
  'indian premier league',
  'wpl',
  "women's premier league",
  'ranji',
  'syed mushtaq',
  'vijay hazare',
  'duleep',
  'bcci',
];

function isIndiaRelevantText(...parts: Array<string | undefined | null>): boolean {
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return INDIA_HINTS.some((h) => hay.includes(h));
}

function isIndiaRelevant(match: NormalizedMatch): boolean {
  return isIndiaRelevantText(
    match.homeTeam?.name,
    match.awayTeam?.name,
    match.competitionName,
    typeof match.metadata?.status === 'string' ? match.metadata.status : '',
  );
}

function tagMatch(m: NormalizedMatch, extra: Record<string, unknown>): NormalizedMatch {
  return {
    ...m,
    metadata: {
      ...(m.metadata ?? {}),
      india_relevance: isIndiaRelevant(m) || extra.forceIndia === true,
      ...extra,
    },
  };
}

export interface IngestCricketSeriesResult {
  seriesId: string;
  seriesName: string;
  category: string;
  matchCount: number;
  created: number;
  updated: number;
  error?: string;
}

export interface IngestCricketResult extends UpsertBatchResult {
  provider: string;
  attemptedProviders: string[];
  totalMatches: number;
  indiaRelevantMatches: number;
  segments: Array<{ segment: string; count: number }>;
  series: IngestCricketSeriesResult[];
}

export function isCricbuzzConfigured(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY?.trim());
}

/**
 * Discover India-relevant series across Cricbuzz categories.
 */
export async function discoverIndiaSeries(cricbuzz = new CricbuzzProvider()): Promise<
  Array<{ id: string; name: string; month?: string; category: string }>
> {
  const cats: Array<'international' | 'league' | 'domestic' | 'women'> = [
    'international',
    'league',
    'domestic',
    'women',
  ];
  const found: Array<{ id: string; name: string; month?: string; category: string }> = [];
  const seen = new Set<string>();
  for (const cat of cats) {
    const series = await cricbuzz.listSeries(cat);
    for (const s of series) {
      if (!isIndiaRelevantText(s.name)) continue;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      found.push(s);
    }
  }
  return found;
}

/**
 * Fetch cricket matches: global segments + India series calendars.
 */
export async function ingestCricketMatches(opts?: {
  segment?: 'upcoming' | 'live' | 'all';
  /** Cap series pulls (rate-limit friendly). Default 12. */
  maxSeries?: number;
  /** Skip series discovery/pulls. */
  skipSeries?: boolean;
}): Promise<IngestCricketResult> {
  const segment = opts?.segment ?? 'all';
  const maxSeries = opts?.maxSeries ?? 12;
  const providerErrors: Array<{ provider: string; message: string }> = [];
  const collected: NormalizedMatch[] = [];
  const byExternalId = new Map<string, NormalizedMatch>();
  const segments: Array<{ segment: string; count: number }> = [];
  const seriesResults: IngestCricketSeriesResult[] = [];
  const attempted: string[] = [];
  let providerName = 'unknown';

  const modes: Array<'upcoming' | 'live'> =
    segment === 'live' ? ['live'] : segment === 'upcoming' ? ['upcoming'] : ['upcoming', 'live'];

  for (const mode of modes) {
    try {
      const result = await sportsRouter.fetchMatches({ sport: 'cricket', live: mode === 'live' });
      providerName = result.providerName;
      for (const name of result.attemptedProviders) {
        if (!attempted.includes(name)) attempted.push(name);
      }
      for (const m of result.data) {
        const tagged = tagMatch(m, { segment: mode });
        byExternalId.set(tagged.providerRef.externalId, tagged);
      }
      segments.push({ segment: mode, count: result.data.length });
    } catch (err) {
      providerErrors.push({
        provider: `router:cricket:${mode}`,
        message: err instanceof Error ? err.message : String(err),
      });
      segments.push({ segment: mode, count: 0 });
    }
  }

  // India series calendars (deliberate — not only global upcoming)
  if (!opts?.skipSeries && isCricbuzzConfigured()) {
    const cricbuzz = new CricbuzzProvider();
    if (!attempted.includes('Cricbuzz')) attempted.push('Cricbuzz');
    providerName = providerName === 'unknown' ? 'Cricbuzz' : providerName;

    try {
      const indiaSeries = await discoverIndiaSeries(cricbuzz);
      const toPull = indiaSeries.slice(0, maxSeries);
      segments.push({ segment: 'india_series_discovered', count: indiaSeries.length });

      for (const s of toPull) {
        try {
          const matches = await cricbuzz.fetchSeriesMatches(s.id);
          let created = 0;
          let updated = 0;
          for (const m of matches) {
            const tagged = tagMatch(m, {
              segment: 'series',
              seriesId: s.id,
              seriesCategory: s.category,
              forceIndia: true,
              india_relevance: true,
            });
            const prev = byExternalId.get(tagged.providerRef.externalId);
            byExternalId.set(tagged.providerRef.externalId, tagged);
            if (prev) updated += 1;
            else created += 1;
          }
          seriesResults.push({
            seriesId: s.id,
            seriesName: s.name,
            category: s.category,
            matchCount: matches.length,
            created,
            updated,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          providerErrors.push({ provider: `cricbuzz:series:${s.id}`, message });
          seriesResults.push({
            seriesId: s.id,
            seriesName: s.name,
            category: s.category,
            matchCount: 0,
            created: 0,
            updated: 0,
            error: message,
          });
        }
      }
    } catch (err) {
      providerErrors.push({
        provider: 'cricbuzz:series-discovery',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  collected.push(...byExternalId.values());
  const batch = await upsertMatches(collected);
  const indiaCount = collected.filter((m) => m.metadata?.india_relevance === true).length;

  return {
    ...batch,
    errors: [...batch.errors, ...providerErrors],
    provider: providerName,
    attemptedProviders: attempted,
    totalMatches: collected.length,
    indiaRelevantMatches: indiaCount,
    segments,
    series: seriesResults,
  };
}
