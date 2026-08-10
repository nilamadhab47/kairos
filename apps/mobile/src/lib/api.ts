import { API_URL } from './env';
import { getAuthCookie } from './auth-client';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Accept', 'application/json');
  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const cookies = getAuthCookie();
  if (cookies) headers.set('Cookie', cookies);

  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
    credentials: 'omit',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(text || res.statusText, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface HealthResponse {
  ok: boolean;
  checks?: Record<string, { ok: boolean; ms?: number; error?: string }>;
}

export function fetchHealth(): Promise<HealthResponse> {
  return api<HealthResponse>('/api/health');
}
