/**
 * Display normalizers for provider-sourced sport metadata.
 *
 * The provider `name` column is preserved verbatim — that is our lookup key
 * and audit trail. Everything below produces *derived* fields that the UI
 * renders (`displayName`, `gender`, `format`, `seasonLabel`) so the app never
 * dumps raw provider strings like `"The Hundred Women's Competition 2026"`
 * into a headline.
 *
 * The rules here are intentionally conservative: if we can't confidently
 * infer a field we return `undefined` and the caller falls back to the raw
 * `name`. No fabrication.
 */

export type CompetitionGender = 'men' | 'women' | 'mixed';

export type CompetitionFormat =
  // cricket
  | 'test'
  | 'odi'
  | 't20i'
  | 't20'
  | 'franchise'
  | 'international'
  | 'first-class'
  | 'list-a'
  // football
  | 'league'
  | 'cup'
  | 'super-cup'
  | 'friendly'
  // f1
  | 'championship'
  // tennis
  | 'grand-slam'
  | 'atp-1000'
  | 'atp-500'
  | 'wta'
  | 'other';

export type Sport =
  | 'football'
  | 'cricket'
  | 'f1'
  | 'tennis'
  | 'basketball'
  | 'baseball'
  | 'hockey';

export interface CompetitionDisplay {
  displayName: string;
  gender?: CompetitionGender;
  format?: CompetitionFormat;
  seasonLabel?: string;
}

/**
 * Break a raw competition name into presentation-ready parts.
 *
 * Examples:
 *   "The Hundred Women's Competition 2026"
 *      → { displayName: "The Hundred", gender: "women", seasonLabel: "2026" }
 *   "Premier League 2025/26"
 *      → { displayName: "Premier League", seasonLabel: "2025/26", format: "league" }
 *   "ICC Men's T20 World Cup 2024"
 *      → { displayName: "ICC T20 World Cup", gender: "men", format: "t20i",
 *          seasonLabel: "2024" }
 */
export function formatCompetitionDisplay(
  rawName: string,
  sport?: Sport,
): CompetitionDisplay {
  const original = (rawName ?? '').trim();
  if (!original) return { displayName: 'Unknown' };

  let work = ` ${original} `; // pad so we can match on word boundaries easily

  const seasonLabel = extractSeason(work);
  if (seasonLabel) {
    work = work.replace(seasonLabel, ' ');
  }

  const gender = extractGender(work);
  if (gender === 'women') work = work.replace(/\bWomen'?s\b/gi, ' ');
  if (gender === 'men') work = work.replace(/\bMen'?s\b/gi, ' ');

  const format = extractFormat(work, sport);

  const displayName = cleanTrailingNoise(work).trim() || original;

  return {
    displayName,
    ...(gender ? { gender } : {}),
    ...(format ? { format } : {}),
    ...(seasonLabel ? { seasonLabel } : {}),
  };
}

function extractSeason(padded: string): string | undefined {
  // Match "2025/26", "2025-2026", "2025-26", "2024/2025", or a bare "2024".
  // Prefer the range form when both appear.
  const range = padded.match(/\b(20\d{2}\s*[-/]\s*(?:20)?\d{2})\b/);
  if (range?.[1]) return range[1].replace(/\s+/g, '');
  const bare = padded.match(/\b(20\d{2})\b/);
  return bare?.[1];
}

function extractGender(padded: string): CompetitionGender | undefined {
  if (/\bWomen'?s\b/i.test(padded)) return 'women';
  if (/\bMen'?s\b/i.test(padded)) return 'men';
  if (/\bMixed\b/i.test(padded)) return 'mixed';
  return undefined;
}

function extractFormat(padded: string, sport?: Sport): CompetitionFormat | undefined {
  if (sport === 'cricket') {
    // Order matters — check the more specific tokens first.
    if (/\bT20I\b/i.test(padded)) return 't20i';
    if (/\bODI\b/i.test(padded)) return 'odi';
    if (/\bTest\s+(Series|Championship|Match)?\b/i.test(padded) && !/\bcontest\b/i.test(padded)) {
      return 'test';
    }
    if (/\bT20\b/i.test(padded) || /\bTwenty20\b/i.test(padded)) return 't20';
    if (/\bFirst[-\s]Class\b/i.test(padded)) return 'first-class';
    if (/\bList\s?A\b/i.test(padded)) return 'list-a';
    // Franchise / league heuristics (IPL, BBL, PSL, CPL, The Hundred, WPL).
    if (
      /\b(IPL|WPL|Big\s*Bash|BBL|PSL|CPL|The\s+Hundred|SA20|LPL|MLC)\b/i.test(padded) ||
      /\bIndian\s+Premier\s+League\b/i.test(padded) ||
      /\bWomen'?s\s+Premier\s+League\b/i.test(padded) ||
      /\bBig\s+Bash\s+League\b/i.test(padded) ||
      /\bPakistan\s+Super\s+League\b/i.test(padded) ||
      /\bCaribbean\s+Premier\s+League\b/i.test(padded)
    ) {
      return 'franchise';
    }
    // "India tour of Australia" etc.
    if (/\btour\s+of\b/i.test(padded)) return 'international';
    return undefined;
  }

  if (sport === 'football') {
    if (/\b(FA\s+Cup|Copa\s+del\s+Rey|EFL\s+Cup|Coppa\s+Italia|Copa\s+America|World\s+Cup|Euros?|European\s+Championship)\b/i.test(padded)) {
      return /World\s+Cup|Euros?|European\s+Championship|Copa\s+America/i.test(padded)
        ? 'cup'
        : 'cup';
    }
    if (/\bSuper\s+Cup\b/i.test(padded)) return 'super-cup';
    if (/\bFriendly\b/i.test(padded)) return 'friendly';
    if (/\b(Premier\s+League|La\s+Liga|Serie\s+A|Bundesliga|Ligue\s+1|MLS|Championship|Eredivisie|Primeira\s+Liga|Champions\s+League|Europa\s+League|Conference\s+League)\b/i.test(padded)) {
      return 'league';
    }
    return undefined;
  }

  if (sport === 'f1') return 'championship';

  if (sport === 'tennis') {
    if (/\b(Australian\s+Open|Roland\s+Garros|French\s+Open|Wimbledon|US\s+Open)\b/i.test(padded)) {
      return 'grand-slam';
    }
    if (/\bATP\s+1000\b|\bMasters\s+1000\b/i.test(padded)) return 'atp-1000';
    if (/\bATP\s+500\b/i.test(padded)) return 'atp-500';
    if (/\bWTA\b/i.test(padded)) return 'wta';
    return 'other';
  }

  return undefined;
}

/**
 * Strip trailing marketing noise ("Competition", "Season", "Tour") and squeeze
 * whitespace/punctuation. Keeps meaningful tokens like "Cup" or "Championship".
 */
function cleanTrailingNoise(s: string): string {
  return s
    .replace(/[\s,·•\-–—]+/g, ' ') // collapse separators
    .replace(/\bCompetition\b/gi, ' ')
    .replace(/\bSeason\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.\-–—]+/, '')
    .replace(/[\s,.\-–—]+$/, '');
}

/* -------------------------------------------------------------------------- */
/*  Team type inference                                                        */
/* -------------------------------------------------------------------------- */

export type TeamType = 'club' | 'national' | 'franchise' | 'constructor';

/**
 * Best-effort team classification. Uses sport, competition format, and a small
 * name-heuristic for cricket national teams. Returns `undefined` when nothing
 * confident can be inferred — the DB column stays NULL rather than be wrong.
 */
export function inferTeamType(opts: {
  sport: Sport;
  teamName: string;
  competitionFormat?: CompetitionFormat;
}): TeamType | undefined {
  const { sport, teamName, competitionFormat } = opts;

  if (sport === 'f1') return 'constructor';

  if (sport === 'cricket') {
    if (competitionFormat === 'franchise') return 'franchise';
    if (
      competitionFormat === 'international' ||
      competitionFormat === 'test' ||
      competitionFormat === 'odi' ||
      competitionFormat === 't20i'
    ) {
      return 'national';
    }
    // Fall back to the name — "India", "Australia", "England" etc. are national.
    if (CRICKET_NATIONS.has(teamName.trim())) return 'national';
    return undefined;
  }

  if (sport === 'football' || sport === 'basketball' || sport === 'baseball' || sport === 'hockey') {
    // National teams for football surface in international competitions —
    // caller should pass `competitionFormat: 'cup'` for World Cup / Euros
    // etc., but we can't distinguish them purely by name. Default to 'club'.
    return 'club';
  }

  return undefined;
}

const CRICKET_NATIONS = new Set([
  'India',
  'Australia',
  'England',
  'Pakistan',
  'South Africa',
  'New Zealand',
  'Sri Lanka',
  'Bangladesh',
  'West Indies',
  'Afghanistan',
  'Zimbabwe',
  'Ireland',
  'Netherlands',
  'Scotland',
  'USA',
  'Nepal',
]);
