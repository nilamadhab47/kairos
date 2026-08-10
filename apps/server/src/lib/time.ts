/** Timezone helpers for "today" / "week" windows in the user's local zone. */

export function zonedDayBounds(
  timeZone: string,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';

  const start = zonedLocalToUtc(timeZone, `${y}-${m}-${d}`, '00:00:00');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Rolling window: start of today in `timeZone` through N days ahead (exclusive end). */
export function zonedNextDaysBounds(
  timeZone: string,
  days: number,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  const { start } = zonedDayBounds(timeZone, ref);
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function zonedWeekBounds(
  timeZone: string,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  const { start: dayStart } = zonedDayBounds(timeZone, ref);
  // Monday-start week in user TZ: get weekday of dayStart in that TZ
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(dayStart);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = map[weekday] ?? 0;
  const start = new Date(dayStart.getTime() - offset * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function zonedLocalToUtc(timeZone: string, date: string, time: string): Date {
  // Interpret date+time as wall clock in timeZone → UTC Date
  const guess = new Date(`${date}T${time}Z`);
  const asUtc = new Date(
    guess.toLocaleString('en-US', { timeZone: 'UTC' }),
  ).getTime();
  const asZoned = new Date(
    guess.toLocaleString('en-US', { timeZone }),
  ).getTime();
  const offset = asZoned - asUtc;
  return new Date(guess.getTime() - offset);
}

export function parseTimeToDate(time: string): Date {
  // Store TIME columns as Date at 1970-01-01T{time}Z for Prisma
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) throw new Error(`Invalid time: ${time}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? 0);
  return new Date(Date.UTC(1970, 0, 1, hh, mm, ss));
}

export function formatTimeFromDate(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
