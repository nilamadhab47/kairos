import * as SecureStore from 'expo-secure-store';
import { env } from './env';

const TOKEN_KEY = 'kairo.jwt';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `API error ${status}`);
  }
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts;
  const url = `${env.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';

  if (auth) {
    const token = await getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) throw new ApiError(res.status, payload);
  return payload as T;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  timestamp: string;
  checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }>;
}

export function fetchHealth(): Promise<HealthResponse> {
  return api<HealthResponse>('/health', { auth: false });
}
