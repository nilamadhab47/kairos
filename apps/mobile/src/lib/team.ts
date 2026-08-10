/**
 * Presentation-layer abbreviation resolver for a team.
 *
 * Order of preference:
 *   1. A hand-curated override for well-known clubs (avoids weird auto-fallbacks
 *      like "PAR" for Paris Saint-Germain).
 *   2. A provider-supplied `shortName` when it's already 2–4 chars.
 *   3. Deterministic initials from the full name, stripping club noise
 *      words (FC / AC / SC / CF / etc).
 *
 * Guarantees: single line, ≤ 4 characters, uppercase, never empty.
 */

const OVERRIDES: Record<string, string> = {
  // Football — big five leagues
  'paris saint-germain': 'PSG',
  'paris saint germain': 'PSG',
  'atlético madrid': 'ATM',
  'atletico madrid': 'ATM',
  'atletico de madrid': 'ATM',
  'atlético de madrid': 'ATM',
  'real madrid': 'RMA',
  'fc barcelona': 'BAR',
  barcelona: 'BAR',
  'manchester united': 'MUN',
  'manchester city': 'MCI',
  arsenal: 'ARS',
  chelsea: 'CHE',
  liverpool: 'LIV',
  tottenham: 'TOT',
  'tottenham hotspur': 'TOT',
  'bayern munich': 'BAY',
  'fc bayern münchen': 'BAY',
  'bayer leverkusen': 'B04',
  'borussia dortmund': 'BVB',
  juventus: 'JUV',
  'inter milan': 'INT',
  internazionale: 'INT',
  'ac milan': 'MIL',
  'as roma': 'ROM',
  napoli: 'NAP',
  'ajax amsterdam': 'AJA',
  ajax: 'AJA',
  benfica: 'BEN',
  porto: 'POR',
  sevilla: 'SEV',
  'rayo vallecano': 'RAY',
  málaga: 'MAL',
  malaga: 'MAL',
  valencia: 'VAL',
  'real sociedad': 'RSO',
  'athletic bilbao': 'ATH',
  villarreal: 'VIL',
  'real betis': 'BET',
  'celta vigo': 'CEL',

  // F1 constructors
  'red bull racing': 'RBR',
  ferrari: 'FER',
  mclaren: 'MCL',
  mercedes: 'MER',
  'aston martin': 'AMR',
  williams: 'WIL',
  alpine: 'ALP',
  haas: 'HAS',
  sauber: 'SAU',
  'racing bulls': 'RB',

  // Cricket — common national sides
  india: 'IND',
  australia: 'AUS',
  england: 'ENG',
  'south africa': 'RSA',
  'new zealand': 'NZ',
  pakistan: 'PAK',
  'sri lanka': 'SL',
  bangladesh: 'BAN',
  'west indies': 'WI',
  afghanistan: 'AFG',
};

const STOPWORDS = new Set([
  'fc',
  'cf',
  'ac',
  'sc',
  'sk',
  'sv',
  'as',
  'us',
  'ss',
  'cd',
  'ca',
  'the',
  'de',
  'del',
  'la',
  'le',
  'los',
  'las',
  'club',
  'united',
]);

export function teamAbbreviation(
  name: string,
  shortName?: string | null,
): string {
  const key = name.trim().toLowerCase();
  if (OVERRIDES[key]) return OVERRIDES[key];

  const sn = (shortName ?? '').trim();
  // Providers sometimes ship `shortName` that's actually the full name.
  // Only trust it when it's already tight enough.
  if (sn && sn.length >= 2 && sn.length <= 4 && !/\s/.test(sn)) {
    return sn.toUpperCase();
  }

  return initialsFromName(name);
}

function initialsFromName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^A-Za-z0-9\s'-]/g, ' ')
    .trim();
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));

  if (words.length === 0) {
    // All words were stop-words — fall back to raw
    return name.slice(0, 3).toUpperCase() || '·';
  }
  if (words.length === 1) {
    const w = words[0];
    return (w.length >= 3 ? w.slice(0, 3) : w).toUpperCase();
  }
  // 2+ words: take initial of the first 3 significant words.
  return words
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
