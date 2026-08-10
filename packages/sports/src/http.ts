/**
 * Shared HTTP client for sports providers.
 *
 * Guarantees:
 *   - Real provider responses only. No fallback to fabricated data.
 *   - Per-host token-bucket rate limiting (avoids 429/soft-bans).
 *   - Timeout per request (default 12s).
 *   - Retries with exponential backoff + jitter on 429 / 5xx / network errors.
 *   - Never retries 4xx (except 429). Bubbles up ProviderError to callers.
 *   - Provenance-friendly: every failure logs provider + host + status.
 */

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 4;
const DEFAULT_BACKOFF_BASE_MS = 600;
const DEFAULT_BACKOFF_MAX_MS = 20_000;

export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly url: string;
  readonly attempt: number;
  override readonly cause?: unknown;

  constructor(
    message: string,
    provider: string,
    status: number,
    url: string,
    attempt: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.url = url;
    this.attempt = attempt;
    this.cause = cause;
  }
}

export interface RateLimit {
  /** Maximum requests per interval, per host. */
  requests: number;
  /** Interval in milliseconds. */
  intervalMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
  refillPerMs: number;
  capacity: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Provider adapters call this once to declare their host's throttle.
 * Safe to call multiple times — last one wins per host.
 */
export function setRateLimit(host: string, limit: RateLimit): void {
  buckets.set(host, {
    tokens: limit.requests,
    updatedAt: Date.now(),
    refillPerMs: limit.requests / limit.intervalMs,
    capacity: limit.requests,
  });
}

async function acquireToken(host: string): Promise<void> {
  const bucket = buckets.get(host);
  if (!bucket) return; // no throttle configured
  while (true) {
    const now = Date.now();
    const elapsed = now - bucket.updatedAt;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
    bucket.updatedAt = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - bucket.tokens) / bucket.refillPerMs);
    await sleep(Math.max(50, waitMs));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const asSeconds = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(asSeconds) && asSeconds > 0) return Math.min(asSeconds * 1000, DEFAULT_BACKOFF_MAX_MS);
  }
  const exp = Math.min(DEFAULT_BACKOFF_MAX_MS, DEFAULT_BACKOFF_BASE_MS * 2 ** attempt);
  const jitter = Math.random() * exp * 0.25;
  return exp + jitter;
}

export interface ProviderFetchOptions {
  /** Provider identifier used in error messages / logs. */
  provider: string;
  /** Absolute URL. */
  url: string;
  /** Extra headers (auth, host, UA). */
  headers?: Record<string, string>;
  /** HTTP method. Defaults to GET. */
  method?: 'GET' | 'POST';
  /** JSON body (POST). */
  body?: unknown;
  /** Per-call timeout override. */
  timeoutMs?: number;
  /** Per-call retry override (default 3). */
  retries?: number;
  /** Signal to allow caller cancellation. */
  signal?: AbortSignal;
}

/**
 * Perform a JSON HTTP request against a sports provider with retries,
 * rate limiting and timeout. Throws {@link ProviderError} on final failure.
 * Never returns fabricated data.
 */
export async function providerFetchJson<T>(opts: ProviderFetchOptions): Promise<T> {
  const { provider, url, headers, method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, signal } = opts;

  const host = new URL(url).host;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    await acquireToken(host);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onExternalAbort = () => ac.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ac.signal,
      });

      if (res.ok) {
        // Some providers return HTML on soft-block — enforce JSON.
        const text = await res.text();
        try {
          return JSON.parse(text) as T;
        } catch (parseErr) {
          throw new ProviderError(
            `Non-JSON response from ${provider} (${res.status}, ${text.slice(0, 120)})`,
            provider,
            res.status,
            url,
            attempt,
            parseErr,
          );
        }
      }

      // Retryable server / rate-limit errors
      const shouldRetry =
        (res.status === 429 || (res.status >= 500 && res.status <= 599)) && attempt < retries;

      if (!shouldRetry) {
        throw new ProviderError(
          `${provider} ${method} ${url} failed: ${res.status} ${res.statusText}`,
          provider,
          res.status,
          url,
          attempt,
        );
      }

      const retryAfter = res.headers.get('retry-after');
      lastError = new ProviderError(
        `${provider} transient ${res.status}`,
        provider,
        res.status,
        url,
        attempt,
      );
      await sleep(backoffMs(attempt, retryAfter));
      attempt += 1;
      continue;
    } catch (err) {
      if (err instanceof ProviderError && err.status > 0 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      lastError = err;
      if (attempt >= retries) break;
      await sleep(backoffMs(attempt));
      attempt += 1;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError(
    `${provider} network/timeout after ${attempt} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    provider,
    0,
    url,
    attempt,
    lastError,
  );
}
