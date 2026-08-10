/**
 * Tennis ingest job.
 *
 * Routes through the sports router (SportAPI7 is the primary tennis provider
 * today; ESPN tennis is a valid fallback). Pulls today + N upcoming days.
 *
 * Data rule: real provider data only. Empty result = the provider genuinely
 * has no scheduled matches (e.g. between tournaments). Never fabricated.
 */

import { sportsRouter, upsertMatches } from '@kairo/sports';
import type { NormalizedMatch, UpsertBatchResult } from '@kairo/sports';

export interface IngestTennisResult extends UpsertBatchResult {
  provider: string;
  attemptedProviders: string[];
  daysAttempted: number;
  daysWithData: number;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function ingestTennisMatches(opts?: {
  daysAhead?: number;
}): Promise<IngestTennisResult> {
  const daysAhead = Math.max(1, Math.min(14, opts?.daysAhead ?? 7));
  const collected: NormalizedMatch[] = [];
  const errors: Array<{ provider: string; message: string }> = [];
  const attempted: string[] = [];
  let providerName = 'unknown';
  let daysWithData = 0;

  const start = new Date();
  for (let offset = 0; offset < daysAhead; offset += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + offset);
    const iso = toIsoDate(d);
    try {
      const result = await sportsRouter.fetchMatches({ sport: 'tennis', date: iso });
      providerName = result.providerName;
      for (const name of result.attemptedProviders) {
        if (!attempted.includes(name)) attempted.push(name);
      }
      if (result.data.length > 0) daysWithData += 1;
      collected.push(...result.data);
    } catch (err) {
      errors.push({
        provider: `router:tennis:${iso}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const batch = await upsertMatches(collected);
  return {
    ...batch,
    errors: [...batch.errors, ...errors],
    provider: providerName,
    attemptedProviders: attempted,
    daysAttempted: daysAhead,
    daysWithData,
  };
}
