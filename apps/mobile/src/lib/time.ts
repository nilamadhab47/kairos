import { useEffect, useState } from 'react';

/** Ticks every `intervalMs` (default 30s). Cheap; used for countdowns. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Human relative countdown. Uses long units when the event is far,
 * a live clock when < 1h. Returns present-tense when live.
 */
export function humanCountdown(startsAt: number, now: number): string {
  const diff = Math.round((startsAt - now) / 1000);
  if (diff <= 0) return 'now';
  if (diff < 60) return `in ${diff}s`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins ? `in ${hours}h ${remMins}m` : `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days}d`;
}

/**
 * Precise HH:MM:SS or MM:SS when < 1h. Used by hero countdown clock.
 */
export function clockCountdown(startsAt: number, now: number): string {
  const diff = Math.max(0, Math.round((startsAt - now) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Locale-friendly HH:mm in user's timezone. */
export function formatLocalTime(iso: string, timezone?: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return '';
  }
}

/** Greeting based on device local hour (or provided tz). */
export function greeting(now: number, timezone?: string): string {
  const hour = Number(
    new Date(now).toLocaleString(undefined, { hour: '2-digit', hour12: false, timeZone: timezone }),
  );
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}
