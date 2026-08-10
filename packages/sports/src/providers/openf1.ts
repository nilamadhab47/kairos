/**
 * OpenF1 adapter — free F1 data provider.
 * No API key needed. Provides sessions, drivers, laps, telemetry.
 * Live provider data only — no fabricated fallback.
 */

import type {
  SportsProvider,
  SportsProviderConfig,
  FetchMatchesOpts,
} from '../provider.js';
import type {
  NormalizedMatch,
  NormalizedCompetition,
  MatchStatus,
  SportId,
} from '../types.js';
import { providerFetchJson, setRateLimit } from '../http.js';

const BASE_URL = (process.env.OPENF1_BASE_URL || 'https://api.openf1.org/v1').replace(/\/$/, '');
setRateLimit(new URL(BASE_URL).host, { requests: 60, intervalMs: 60_000 });

const PROVIDER = 'OpenF1';

async function fetchApi<T>(path: string): Promise<T> {
  return providerFetchJson<T>({
    provider: PROVIDER,
    url: `${BASE_URL}${path}`,
    headers: { Accept: 'application/json' },
  });
}

function mapSessionStatus(startsAt: Date, endsAt: Date | null, isCancelled?: boolean): MatchStatus {
  if (isCancelled) return 'cancelled';
  const now = Date.now();
  if (now < startsAt.getTime()) return 'scheduled';
  if (endsAt && now <= endsAt.getTime()) return 'live';
  if (!endsAt && now - startsAt.getTime() < 3 * 60 * 60_000) return 'live';
  return 'completed';
}

export class OpenF1Provider implements SportsProvider {
  readonly config: SportsProviderConfig = {
    name: PROVIDER,
    sports: ['f1'],
    priority: 1,
  };

  async healthCheck(): Promise<boolean> {
    try {
      const year = new Date().getUTCFullYear();
      await fetchApi(`/sessions?year=${year}&session_type=Race`);
      return true;
    } catch {
      return false;
    }
  }

  async fetchMatches(opts: FetchMatchesOpts): Promise<NormalizedMatch[]> {
    if (opts.sport !== 'f1') return [];

    const year = opts.date ? Number(opts.date.slice(0, 4)) : new Date().getUTCFullYear();
    let path = `/sessions?year=${year}`;
    if (opts.date) {
      path += `&date_start>=${opts.date}T00:00:00&date_start<=${opts.date}T23:59:59`;
    }

    const sessions = await fetchApi<any[]>(path);
    return sessions
      .filter((s) => s.session_key && s.date_start)
      .map((s) => {
        const startsAt = new Date(s.date_start);
        const endsAt = s.date_end ? new Date(s.date_end) : null;
        return {
          id: `openf1:${s.session_key}`,
          sport: 'f1' as SportId,
          competitionId: `openf1:meeting:${s.meeting_key}`,
          competitionName: s.meeting_name ?? 'Formula 1',
          // F1 sessions are not head-to-head — no home/away opponents.
          // Constructors and drivers are separate entities users follow.
          startsAt,
          status: mapSessionStatus(startsAt, endsAt, s.is_cancelled),
          venue: s.circuit_short_name ?? s.location,
          round: s.session_name ?? s.session_type,
          metadata: {
            sessionKey: s.session_key,
            sessionType: s.session_type,
            sessionName: s.session_name,
            circuitKey: s.circuit_key,
            circuitShortName: s.circuit_short_name,
            location: s.location,
            countryCode: s.country_code,
            countryName: s.country_name,
            gmtOffset: s.gmt_offset,
            year: s.year,
            meetingKey: s.meeting_key,
            meetingName: s.meeting_name,
          },
          providerRef: { provider: 'openf1', externalId: String(s.session_key) },
        };
      });
  }

  /**
   * Distinct constructors active in a season. OpenF1's `/drivers?year=YYYY`
   * exposes `team_name` (e.g. "Ferrari", "McLaren", "Red Bull Racing"), which
   * is the canonical constructor name — no fabricated data.
   */
  async fetchConstructors(year?: number): Promise<Array<{ id: string; name: string; providerRef: { provider: string; externalId: string } }>> {
    const y = year ?? new Date().getUTCFullYear();
    let drivers: Array<{ team_name?: string }> = [];
    try {
      drivers = await fetchApi<Array<{ team_name?: string }>>(`/drivers?year=${y}`);
    } catch (err) {
      // OpenF1 returns 404 for years it hasn't published yet — surface an empty
      // list so callers can fall back to previous seasons rather than crashing.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) throw err;
      return [];
    }
    const distinct = new Map<string, string>();
    for (const d of drivers) {
      const name = (d.team_name ?? '').trim();
      if (!name) continue;
      // Normalize "Red Bull Racing" vs "Oracle Red Bull Racing" as best-effort.
      distinct.set(name.toLowerCase(), name);
    }
    return [...distinct.values()].map((name) => ({
      id: `openf1:constructor:${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      providerRef: { provider: 'openf1', externalId: `constructor:${name}` },
    }));
  }

  async fetchCompetitions(_sport: SportId): Promise<NormalizedCompetition[]> {
    const year = new Date().getUTCFullYear();
    const meetings = await fetchApi<any[]>(`/meetings?year=${year}`);

    return meetings
      .filter((m) => m.meeting_key)
      .map((m) => ({
        id: `openf1:meeting:${m.meeting_key}`,
        name: m.meeting_name ?? m.meeting_official_name ?? 'Unknown GP',
        sport: 'f1' as SportId,
        country: m.country_name,
        season: String(year),
        providerRef: { provider: 'openf1', externalId: String(m.meeting_key) },
      }));
  }
}
