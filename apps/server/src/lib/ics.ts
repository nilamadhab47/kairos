/**
 * Minimal, dependency-free iCalendar (RFC 5545) writer for the personal
 * calendar-subscription feed. Produces a VCALENDAR that Google Calendar,
 * Apple Calendar and Outlook can subscribe to by URL and re-poll for updates.
 *
 * We only emit VEVENTs — no VALARM (users already get Kairo push), no VTIMEZONE
 * (all times are emitted as UTC `Z` instants, which every client renders in the
 * viewer's own zone). Never invent data: fields absent on the match are omitted.
 */

export interface IcsEvent {
  /** Stable, globally-unique id. Reuse the match id so updates replace, not duplicate. */
  uid: string;
  start: Date;
  /** Optional explicit end. Defaults to start + `defaultDurationMin`. */
  end?: Date | null;
  summary: string;
  description?: string | null;
  location?: string | null;
  /** Maps to ICS STATUS. */
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  /** Last time the underlying row changed — becomes DTSTAMP / LAST-MODIFIED. */
  updatedAt?: Date | null;
  url?: string | null;
}

const CRLF = '\r\n';

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** UTC timestamp in iCalendar basic format: 20260908T193000Z */
function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape per RFC 5545 §3.3.11 (backslash, comma, semicolon, newline). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold long content lines to <=75 octets per RFC 5545 §3.1. We fold on
 * character count (a safe approximation for our mostly-ASCII content) and
 * indent continuation lines with a single space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length > 0) chunks.push(` ${rest}`);
  return chunks.join(CRLF);
}

export interface IcsCalendarOptions {
  /** Calendar display name (X-WR-CALNAME) shown in Google/Apple. */
  name: string;
  /** IANA tz for X-WR-TIMEZONE hint (events are still UTC instants). */
  timezone?: string;
  /** Default VEVENT length when the match has no explicit end. */
  defaultDurationMin?: number;
  /** Suggested client refresh interval. */
  refreshIntervalMin?: number;
}

export function buildIcsCalendar(events: IcsEvent[], opts: IcsCalendarOptions): string {
  const durationMin = opts.defaultDurationMin ?? 120;
  const refreshMin = opts.refreshIntervalMin ?? 180;
  const stamp = toIcsUtc(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kairo//Sports Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    `NAME:${escapeText(opts.name)}`,
    `X-PUBLISHED-TTL:PT${refreshMin}M`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshMin}M`,
  ];
  if (opts.timezone) lines.push(`X-WR-TIMEZONE:${escapeText(opts.timezone)}`);

  for (const ev of events) {
    const end =
      ev.end ?? new Date(ev.start.getTime() + durationMin * 60_000);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeText(ev.uid)}@kairo`);
    lines.push(`DTSTAMP:${ev.updatedAt ? toIcsUtc(ev.updatedAt) : stamp}`);
    lines.push(`DTSTART:${toIcsUtc(ev.start)}`);
    lines.push(`DTEND:${toIcsUtc(end)}`);
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.url) lines.push(`URL:${escapeText(ev.url)}`);
    if (ev.status) lines.push(`STATUS:${ev.status}`);
    if (ev.updatedAt) lines.push(`LAST-MODIFIED:${toIcsUtc(ev.updatedAt)}`);
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
