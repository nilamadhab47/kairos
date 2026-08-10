/**
 * F1 ingest job — pulls sessions for the current F1 season through the sports
 * router (OpenF1 primary; ESPN can be added as fallback if wired in).
 *
 * Real provider data only. If every provider fails, the ingest surfaces the
 * error — it never writes fabricated data.
 */

import { sportsRouter, upsertMatches } from '@kairo/sports';
import type { UpsertBatchResult } from '@kairo/sports';

export interface IngestF1Result extends UpsertBatchResult {
  provider: string;
  attemptedProviders: string[];
  year: number;
}

/**
 * Ingest the entire current F1 season into the normalized sports domain
 * (Match/Competition/Team) and mirror rows into the legacy Event table.
 */
export async function ingestOpenF1Sessions(opts?: {
  year?: number;
}): Promise<IngestF1Result> {
  const year = opts?.year ?? new Date().getUTCFullYear();

  // OpenF1 adapter returns the full current year when no `date` is passed.
  // For historical years we'd add a dedicated adapter method — F1 backfill
  // is not required for the live product loop.
  const { data: matches, providerName, attemptedProviders } = await sportsRouter.fetchMatches({
    sport: 'f1',
  });

  const filtered = matches.filter((m) => m.startsAt.getUTCFullYear() === year);
  const batch = await upsertMatches(filtered);

  return {
    ...batch,
    provider: providerName,
    attemptedProviders,
    year,
  };
}
