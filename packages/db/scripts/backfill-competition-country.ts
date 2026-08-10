/**
 * Populate `Competition.country` for rows where it's still null.
 *
 * WHY: `TheSportsDBProvider.resolveCompetitionLogo` falls back to
 * `search_all_leagues.php?c=<country>` when no curated id exists. That
 * fallback only fires when we know the country. Most competitions get
 * ingested from providers that don't return a country string (Cricbuzz
 * tour names, generic feeds), so we lose the whole fallback path.
 *
 * This script does purely-derived inference from name/displayName —
 * no network calls, no LLMs. If a rule fires, we write; otherwise we
 * leave the row alone.
 *
 * Idempotent. Only writes when country was NULL or empty.
 *
 * Usage:
 *   pnpm --filter @kairo/server exec tsx ../../packages/db/scripts/backfill-competition-country.ts
 *   pnpm --filter @kairo/server exec tsx ../../packages/db/scripts/backfill-competition-country.ts --dry
 */

import { prisma } from '../src/index.js';

interface Row {
  id: string;
  sportId: string;
  name: string;
  displayName: string | null;
  country: string | null;
}

interface Rule {
  match: RegExp;
  country: string;
  /** Optional sport filter — only apply this rule when sportId matches. */
  sport?: string;
}

/**
 * Rules are evaluated in order — put more specific first. The first
 * match wins so an "Australia tour of India" isn't mistakenly labelled
 * Australia (tour names capture the *host* country downstream).
 */
const RULES: Rule[] = [
  /* -------------------- Cricket: tours (host is the country) -----------
   * Match "tour of <Country>" where <Country> is 1-3 capitalised words.
   * Anchored so we don't run past into another clause.
   */
  { match: /\btour of\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/, country: '$1', sport: 'cricket' },

  /* -------------------- Cricket: country-affiliated comps ---------------- */
  { match: /\b(ipl|indian premier league|ranji trophy|duleep trophy|vijay hazare|syed mushtaq ali|tnpl|tamil nadu premier league|dpl|delhi premier league|mumbai t20|karnataka premier league)\b/i, country: 'India', sport: 'cricket' },
  { match: /\b(bbl|big bash|sheffield shield|marsh cup|kfc big bash)\b/i, country: 'Australia', sport: 'cricket' },
  { match: /\b(psl|pakistan super league|quaid[- ]e[- ]azam)\b/i, country: 'Pakistan', sport: 'cricket' },
  { match: /\b(cpl|caribbean premier league|west indies)\b/i, country: 'West Indies', sport: 'cricket' },
  { match: /\b(bpl|bangladesh premier league|dhaka premier league)\b/i, country: 'Bangladesh', sport: 'cricket' },
  { match: /\b(the hundred|county championship|t20 blast|english domestic|england domestic|royal london cup)\b/i, country: 'England', sport: 'cricket' },
  { match: /\b(super smash|new zealand|black caps)\b/i, country: 'New Zealand', sport: 'cricket' },
  { match: /\b(lpl|lanka premier league|sri lanka)\b/i, country: 'Sri Lanka', sport: 'cricket' },
  { match: /\b(sa20|csa t20|proteas|south africa)\b/i, country: 'South Africa', sport: 'cricket' },
  { match: /\b(ilt20|international league t20|uae)\b/i, country: 'United Arab Emirates', sport: 'cricket' },
  { match: /\b(afghanistan|shpageeza)\b/i, country: 'Afghanistan', sport: 'cricket' },
  { match: /\b(zimbabwe|logan cup)\b/i, country: 'Zimbabwe', sport: 'cricket' },
  { match: /\b(icc|world cup|champions trophy|world test championship)\b/i, country: 'International', sport: 'cricket' },

  /* -------------------- Football: country-affiliated comps --------------- */
  { match: /\b(premier league|efl championship|efl cup|carabao cup|fa cup|community shield|women's super league|wsl|isthmian league|northern premier league|southern football league|national league)\b/i, country: 'England' },
  { match: /\b(scottish premiership|scottish cup|scottish championship|scottish league|spfl)\b/i, country: 'Scotland' },
  { match: /\b(la liga|primera división|primera division|copa del rey|supercopa de españa|segunda división|segunda division)\b/i, country: 'Spain' },
  { match: /\b(serie a|coppa italia|supercoppa italiana|serie b|serie c)\b/i, country: 'Italy' },
  { match: /\b(bundesliga|dfb[ -]?pokal|dfl[ -]?supercup|2\. bundesliga|3\. liga|regionalliga|oberliga|dfb)\b/i, country: 'Germany' },
  { match: /\b(ligue 1|ligue 2|coupe de france|trophée des champions|national 1|national 2)\b/i, country: 'France' },
  { match: /\b(eredivisie|vriendenloterij eredivisie|eerste divisie|knvb beker)\b/i, country: 'Netherlands' },
  { match: /\b(liga portugal|primeira liga|taça de portugal|taca de portugal|liga portugal betclic)\b/i, country: 'Portugal' },
  { match: /\b(süper lig|super lig|1\. lig|türkiye kupası|turkiye kupasi)\b/i, country: 'Turkey' },
  { match: /\b(jupiler pro league|belgian cup|belgian pro)\b/i, country: 'Belgium' },
  { match: /\b(major league soccer|\bmls\b|us open cup|leagues cup)\b/i, country: 'United States' },
  { match: /\b(liga mx|copa mx|mexican|liga expansión)\b/i, country: 'Mexico' },
  { match: /\b(brasileir[aã]o|brazilian|copa do brasil|serie a brasil|campeonato brasileiro)\b/i, country: 'Brazil' },
  { match: /\b(primera división argentina|argentine primera|argentina)\b/i, country: 'Argentina' },
  { match: /\b(a-league|australian a[ -]league|australia cup)\b/i, country: 'Australia' },
  { match: /\b(j1 league|j2 league|j-league|emperor's cup|japan)\b/i, country: 'Japan' },
  { match: /\b(k[ -]?league|korean fa cup|south korea)\b/i, country: 'South Korea' },
  { match: /\b(chinese super league|csl|chinese fa cup|china)\b/i, country: 'China' },
  { match: /\b(indian super league|\bisl\b|i[ -]league|santosh trophy|india)\b/i, country: 'India' },
  { match: /\b(saudi pro league|saudi league|kings cup|saudi arabia)\b/i, country: 'Saudi Arabia' },
  { match: /\b(süper lig|turkish süper lig|1\. lig)\b/i, country: 'Turkey' },
  { match: /\b(greek super league|super league greece|greek)\b/i, country: 'Greece' },
  { match: /\b(swiss super league|swiss cup)\b/i, country: 'Switzerland' },
  { match: /\b(austrian bundesliga|önb league|austrian cup)\b/i, country: 'Austria' },
  { match: /\b(danish superliga|dbu pokalen|denmark)\b/i, country: 'Denmark' },
  { match: /\b(allsvenskan|svenska cupen|superettan)\b/i, country: 'Sweden' },
  { match: /\b(eliteserien|norway cup|obos-ligaen)\b/i, country: 'Norway' },
  { match: /\b(veikkausliiga|finland)\b/i, country: 'Finland' },
  { match: /\b(ekstraklasa|polish|puchar polski)\b/i, country: 'Poland' },
  { match: /\b(fortuna liga|czech first league|czech cup)\b/i, country: 'Czech Republic' },
  { match: /\b(cyprus first division|cypriot)\b/i, country: 'Cyprus' },
  { match: /\b(persian gulf pro league|hazfi cup|iran)\b/i, country: 'Iran' },
  { match: /\b(egyptian premier league|egypt cup)\b/i, country: 'Egypt' },
  { match: /\b(south african premiership|nedbank cup|psl)\b/i, country: 'South Africa' },

  /* -------------------- Football: international ------------------------- */
  { match: /\b(uefa champions league|uefa europa league|uefa conference league|uefa nations league|uefa super cup|uefa euro|uefa)\b/i, country: 'International' },
  { match: /\b(fifa world cup|fifa club world cup|club world cup|fifa)\b/i, country: 'International' },
  { match: /\b(copa libertadores|copa sudamericana|conmebol|copa américa|copa america)\b/i, country: 'International' },
  { match: /\b(afc champions league|afc asian cup|asian cup|caf champions league|africa cup of nations|concacaf)\b/i, country: 'International' },

  /* -------------------- Tennis (sport-affiliated) ----------------------- */
  { match: /\bwimbledon\b/i, country: 'United Kingdom', sport: 'tennis' },
  { match: /\b(french open|roland[- ]garros)\b/i, country: 'France', sport: 'tennis' },
  { match: /\baustralian open\b/i, country: 'Australia', sport: 'tennis' },
  { match: /\b(us open|united states open)\b/i, country: 'United States', sport: 'tennis' },
  { match: /\batp\b|\bwta\b|\bitf\b|\bdavis cup\b|\bbillie jean king cup\b/i, country: 'International', sport: 'tennis' },
];

function inferCountry(row: Row): string | null {
  // Prefer displayName only (the normalized label). Falling back to
  // `name` risks doubling the year suffix and confusing capture groups
  // for "tour of X" style rules.
  const haystack = (row.displayName ?? row.name).trim();
  for (const rule of RULES) {
    if (rule.sport && rule.sport !== row.sportId) continue;
    const m = haystack.match(rule.match);
    if (!m) continue;
    if (rule.country.startsWith('$')) {
      const idx = Number(rule.country.slice(1));
      const captured = (m[idx] ?? '').trim();
      if (captured) return titleCase(captured);
      continue;
    }
    return rule.country;
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  console.log(`[backfill-country] mode=${dryRun ? 'DRY' : 'WRITE'}`);

  const rows = await prisma.competition.findMany({
    where: {
      OR: [{ country: null }, { country: '' }],
      sportId: { in: ['football', 'cricket', 'tennis'] },
    },
    select: { id: true, sportId: true, name: true, displayName: true, country: true },
    orderBy: [{ sportId: 'asc' }, { name: 'asc' }],
  });

  const bySport: Record<string, { scanned: number; matched: number; skipped: number }> = {};
  const preview: { sport: string; label: string; country: string }[] = [];
  const updates: { id: string; country: string }[] = [];

  for (const row of rows) {
    bySport[row.sportId] ??= { scanned: 0, matched: 0, skipped: 0 };
    bySport[row.sportId]!.scanned += 1;
    const country = inferCountry(row);
    if (!country) {
      bySport[row.sportId]!.skipped += 1;
      continue;
    }
    bySport[row.sportId]!.matched += 1;
    updates.push({ id: row.id, country });
    if (preview.length < 25) {
      preview.push({
        sport: row.sportId,
        label: row.displayName ?? row.name,
        country,
      });
    }
  }

  console.log('\nPer-sport summary:');
  for (const [sport, s] of Object.entries(bySport)) {
    const pct = s.scanned ? ((s.matched / s.scanned) * 100).toFixed(1) : '0.0';
    console.log(`  ${sport.padEnd(10)}  scanned=${s.scanned}  matched=${s.matched} (${pct}%)  skipped=${s.skipped}`);
  }

  console.log('\nFirst 25 planned writes:');
  for (const p of preview) {
    console.log(`  [${p.sport}] ${p.label.padEnd(50)} -> ${p.country}`);
  }

  if (dryRun) {
    console.log(`\n[dry] would update ${updates.length} rows. Re-run without --dry to persist.`);
    return;
  }

  // Batch update — 500 at a time to keep tx manageable.
  const CHUNK = 500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    await prisma.$transaction(
      slice.map((u) =>
        prisma.competition.update({ where: { id: u.id }, data: { country: u.country } }),
      ),
    );
    process.stdout.write(`  wrote ${Math.min(i + CHUNK, updates.length)}/${updates.length}\r`);
  }
  console.log(`\n[write] persisted ${updates.length} rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
