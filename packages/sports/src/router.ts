/**
 * Provider router — picks the best provider for a given sport,
 * supports fallback if primary fails, tracks provider health.
 *
 * Data rule: providers are the ONLY source of truth. If every provider fails,
 * the router surfaces the real error — it never returns fabricated data.
 */

import type { SportsProvider, FetchMatchesOpts, FetchStandingsOpts, SearchTeamsOpts } from './provider.js';
import type { SportId, NormalizedMatch, NormalizedStandings, NormalizedTeam, NormalizedCompetition } from './types.js';
import { ProviderError } from './http.js';

interface ProviderHealth {
  /** Timestamp (ms) at which failed providers may be retried. */
  circuitOpenUntil: number;
  /** Consecutive failure count (used for jittered backoff). */
  consecutiveFailures: number;
  lastError?: string;
  lastCheckedAt?: number;
}

const CIRCUIT_BASE_MS = 30_000;
const CIRCUIT_MAX_MS = 5 * 60_000;

export interface RouterResult<T> {
  data: T;
  providerName: string;
  providerErrors: Array<{ provider: string; message: string }>;
  attemptedProviders: string[];
}

export class SportsRouter {
  private providers: SportsProvider[] = [];
  private health = new Map<string, ProviderHealth>();

  register(provider: SportsProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => a.config.priority - b.config.priority);
  }

  getProvidersForSport(sport: SportId): SportsProvider[] {
    return this.providers.filter((p) => p.config.sports.includes(sport));
  }

  listProviders(): Array<{ name: string; sports: SportId[]; priority: number; healthy: boolean; lastError?: string }> {
    const now = Date.now();
    return this.providers.map((p) => {
      const h = this.health.get(p.config.name);
      return {
        name: p.config.name,
        sports: p.config.sports,
        priority: p.config.priority,
        healthy: !h || h.circuitOpenUntil <= now,
        lastError: h?.lastError,
      };
    });
  }

  private markSuccess(name: string): void {
    this.health.set(name, {
      circuitOpenUntil: 0,
      consecutiveFailures: 0,
      lastCheckedAt: Date.now(),
    });
  }

  private markFailure(name: string, err: unknown): void {
    const prev = this.health.get(name);
    const failures = (prev?.consecutiveFailures ?? 0) + 1;
    const backoff = Math.min(CIRCUIT_MAX_MS, CIRCUIT_BASE_MS * 2 ** (failures - 1));
    const jitter = Math.random() * backoff * 0.2;
    this.health.set(name, {
      circuitOpenUntil: Date.now() + backoff + jitter,
      consecutiveFailures: failures,
      lastError: err instanceof Error ? err.message : String(err),
      lastCheckedAt: Date.now(),
    });
  }

  private isHealthy(name: string): boolean {
    const h = this.health.get(name);
    if (!h) return true;
    return h.circuitOpenUntil <= Date.now();
  }

  private async withFallback<T>(
    sport: SportId,
    fn: (provider: SportsProvider) => Promise<T>,
  ): Promise<RouterResult<T>> {
    const candidates = this.getProvidersForSport(sport);
    if (candidates.length === 0) {
      throw new Error(`No provider registered for sport: ${sport}`);
    }

    const errors: Array<{ provider: string; message: string }> = [];
    const attempted: string[] = [];

    // First pass: healthy providers only.
    for (const provider of candidates) {
      if (!this.isHealthy(provider.config.name)) continue;
      attempted.push(provider.config.name);
      try {
        const data = await fn(provider);
        this.markSuccess(provider.config.name);
        return { data, providerName: provider.config.name, providerErrors: errors, attemptedProviders: attempted };
      } catch (err) {
        this.markFailure(provider.config.name, err);
        const msg = err instanceof ProviderError
          ? `${err.provider} ${err.status}: ${err.message}`
          : err instanceof Error
          ? err.message
          : String(err);
        errors.push({ provider: provider.config.name, message: msg });
      }
    }

    // Second pass: circuit-open providers (last resort — provider health has
    // gone bad, but the caller still needs real data and we must try them).
    for (const provider of candidates) {
      if (attempted.includes(provider.config.name)) continue;
      attempted.push(provider.config.name);
      try {
        const data = await fn(provider);
        this.markSuccess(provider.config.name);
        return { data, providerName: provider.config.name, providerErrors: errors, attemptedProviders: attempted };
      } catch (err) {
        this.markFailure(provider.config.name, err);
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ provider: provider.config.name, message: msg });
      }
    }

    const summary = errors.map((e) => `${e.provider}: ${e.message}`).join(' | ');
    throw new Error(`All providers failed for ${sport} — ${summary || 'no providers healthy'}`);
  }

  async fetchMatches(opts: FetchMatchesOpts): Promise<RouterResult<NormalizedMatch[]>> {
    return this.withFallback(opts.sport, (p) => p.fetchMatches(opts));
  }

  async fetchStandings(opts: FetchStandingsOpts): Promise<RouterResult<NormalizedStandings | null>> {
    return this.withFallback(opts.sport, async (p) => {
      if (!p.fetchStandings) return null;
      return p.fetchStandings(opts);
    });
  }

  async fetchTeams(opts: SearchTeamsOpts): Promise<RouterResult<NormalizedTeam[]>> {
    return this.withFallback(opts.sport, async (p) => {
      if (!p.fetchTeams) return [];
      return p.fetchTeams(opts);
    });
  }

  async fetchCompetitions(sport: SportId): Promise<RouterResult<NormalizedCompetition[]>> {
    return this.withFallback(sport, async (p) => {
      if (!p.fetchCompetitions) return [];
      return p.fetchCompetitions(sport);
    });
  }

  /** Live probe of every provider — expensive, use only for admin/health routes. */
  async runHealthProbe(): Promise<Array<{ name: string; healthy: boolean; error?: string }>> {
    const results: Array<{ name: string; healthy: boolean; error?: string }> = [];
    for (const p of this.providers) {
      try {
        const ok = await p.healthCheck();
        if (ok) {
          this.markSuccess(p.config.name);
          results.push({ name: p.config.name, healthy: true });
        } else {
          this.markFailure(p.config.name, new Error('healthCheck returned false'));
          results.push({ name: p.config.name, healthy: false, error: 'healthCheck returned false' });
        }
      } catch (err) {
        this.markFailure(p.config.name, err);
        results.push({
          name: p.config.name,
          healthy: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }
}

/** Singleton router instance */
export const sportsRouter = new SportsRouter();
