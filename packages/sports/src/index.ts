export * from './types.js';
export * from './provider.js';
export * from './router.js';
export * from './providers/index.js';
export { ProviderError, setRateLimit, providerFetchJson } from './http.js';
export { upsertMatch, upsertMatches, upsertStandings, findCompetitionIdByProvider } from './ingest.js';
export type { UpsertMatchResult, UpsertBatchResult } from './ingest.js';

import { sportsRouter } from './router.js';
import { SportAPI7Provider } from './providers/sportapi7.js';
import { CricbuzzProvider } from './providers/cricbuzz.js';
import { TheSportsDBProvider } from './providers/thesportsdb.js';
import { OpenF1Provider } from './providers/openf1.js';
import { APIFootballProvider } from './providers/api-football.js';
import { ESPNProvider } from './providers/espn.js';

/**
 * Initialize the sports router with all configured providers.
 * Call once at server startup.
 */
export function initSportsProviders(): void {
  if (process.env.RAPIDAPI_KEY) {
    sportsRouter.register(new SportAPI7Provider());
    sportsRouter.register(new CricbuzzProvider());
  }

  if (process.env.API_FOOTBALL_KEY) {
    sportsRouter.register(new APIFootballProvider());
  }

  sportsRouter.register(new OpenF1Provider());

  // ESPN — free, no key required. Broad multi-sport coverage.
  sportsRouter.register(new ESPNProvider());

  // TheSportsDB is always available (free key "3" as fallback)
  sportsRouter.register(new TheSportsDBProvider());

  console.log(
    `[sports] Initialized ${sportsRouter.listProviders().length} providers:`,
    sportsRouter.listProviders().map((p) => `${p.name} (${p.sports.join(',')})`).join(', '),
  );
}
