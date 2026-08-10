/**
 * Translate historical Cricbuzz shortcodes stored in `Team.name` into full
 * canonical names. The shortcode moves into `Team.shortName`.
 *
 * Why manual mapping and not the provider?
 *   The provider row we already have IS the shortcode — that's all Cricbuzz
 *   returned to us at ingest time. Re-querying wouldn't yield anything new.
 *   The mapping below is a translation of codes we already own into their
 *   public, canonical names — no fabricated data.
 *
 * The Cricbuzz adapter has been fixed to prefer the full name going forward,
 * so future ingest passes will write the full form directly. This script
 * corrects the rows that were ingested under the old adapter.
 *
 * Usage:
 *   pnpm --filter @kairo/db exec tsx scripts/backfill-cricket-teams.ts --dry
 *   pnpm --filter @kairo/db exec tsx scripts/backfill-cricket-teams.ts
 */

import { prisma } from '../src/index.js';

/**
 * Canonical name lookup. Keys are the shortcodes we saw in the coverage
 * report. Values are the full names as they appear in Cricbuzz / Wikipedia.
 * Extend as we discover more codes — unmatched rows are left untouched.
 */
const SHORTCODE_TO_NAME: Record<string, string> = {
  // ── International men's / women's national sides ─────────────────────────
  IND: 'India',
  AUS: 'Australia',
  ENG: 'England',
  PAK: 'Pakistan',
  SA: 'South Africa',
  RSA: 'South Africa',
  NZ: 'New Zealand',
  SL: 'Sri Lanka',
  BAN: 'Bangladesh',
  BDESH: 'Bangladesh',
  WI: 'West Indies',
  AFG: 'Afghanistan',
  ZIM: 'Zimbabwe',
  IRE: 'Ireland',
  NED: 'Netherlands',
  SCO: 'Scotland',
  USA: 'United States',
  NEP: 'Nepal',
  OMA: 'Oman',
  UAE: 'United Arab Emirates',
  NAM: 'Namibia',
  PNG: 'Papua New Guinea',

  // ── IPL / WPL franchises ─────────────────────────────────────────────────
  MI: 'Mumbai Indians',
  CSK: 'Chennai Super Kings',
  RCB: 'Royal Challengers Bengaluru',
  KKR: 'Kolkata Knight Riders',
  DC: 'Delhi Capitals',
  PBKS: 'Punjab Kings',
  RR: 'Rajasthan Royals',
  SRH: 'Sunrisers Hyderabad',
  GT: 'Gujarat Titans',
  LSG: 'Lucknow Super Giants',
  MIW: 'Mumbai Indians Women',
  RCBW: 'Royal Challengers Bengaluru Women',
  DCW: 'Delhi Capitals Women',
  UPW: 'UP Warriorz',
  GGT: 'Gujarat Giants',

  // ── The Hundred (Men's + Women's) ─────────────────────────────────────────
  LDN: 'London Spirit',
  LDNM: 'London Spirit',
  LDNW: 'London Spirit Women',
  BRM: 'Birmingham Phoenix',
  BRMM: 'Birmingham Phoenix',
  BRMW: 'Birmingham Phoenix Women',
  MNC: 'Manchester Originals',
  MNCM: 'Manchester Originals',
  MNCW: 'Manchester Originals Women',
  NOR: 'Northern Superchargers',
  NORM: 'Northern Superchargers',
  NORW: 'Northern Superchargers Women',
  OVR: 'Oval Invincibles',
  OVRM: 'Oval Invincibles',
  OVRW: 'Oval Invincibles Women',
  SOU: 'Southern Brave',
  SOUM: 'Southern Brave',
  SOUW: 'Southern Brave Women',
  TRT: 'Trent Rockets',
  TRTM: 'Trent Rockets',
  TRTW: 'Trent Rockets Women',
  WEF: 'Welsh Fire',
  WEFM: 'Welsh Fire',
  WEFW: 'Welsh Fire Women',
  // NB: `SUL` was seen in the coverage report but its meaning is not
  // conclusively documented in the Cricbuzz shortcode set — deliberately
  // left unmapped so the row is flagged as unmatched rather than mistranslated.

  // ── Big Bash / WBBL ──────────────────────────────────────────────────────
  ADS: 'Adelaide Strikers',
  BRH: 'Brisbane Heat',
  HUR: 'Hobart Hurricanes',
  MLR: 'Melbourne Renegades',
  MLS: 'Melbourne Stars',
  PRS: 'Perth Scorchers',
  SIX: 'Sydney Sixers',
  THU: 'Sydney Thunder',

  // ── Pakistan Super League ────────────────────────────────────────────────
  // NB: PSL shortcodes ISL/KAR overlap with unrelated Indian teams (ISL = Indian
  // Super League football team elsewhere in our DB; KAR = Karnataka in Ranji).
  // Currently our cricket DB uses KAR for Karnataka; leave PSL codes commented
  // until a PSL row shows up unambiguously in the coverage report.
  // ISL: 'Islamabad United',
  // KAR: 'Karachi Kings',
  LHR: 'Lahore Qalandars',
  MUL: 'Multan Sultans',
  PES: 'Peshawar Zalmi',
  QUE: 'Quetta Gladiators',

  // ── Caribbean Premier League ─────────────────────────────────────────────
  // BAR overlaps with Baroda (BRD in our DB); safe to map because Baroda is
  // already covered under BRD. Add if a CPL row appears in the coverage report.
  // BAR: 'Barbados Royals',
  GUY: 'Guyana Amazon Warriors',
  JAM: 'Jamaica Tallawahs',
  SLC: 'Saint Lucia Kings',
  SNP: 'Saint Kitts and Nevis Patriots',
  TKR: 'Trinbago Knight Riders',

  // ── SA20 ─────────────────────────────────────────────────────────────────
  DSG: 'Durban Super Giants',
  JSK: 'Joburg Super Kings',
  MICT: 'MI Cape Town',
  PC: 'Paarl Royals',
  PR: 'Pretoria Capitals',
  SEC: 'Sunrisers Eastern Cape',

  // ── Ranji Trophy / Indian domestic (state sides) ─────────────────────────
  MUM: 'Mumbai',
  DEL: 'Delhi',
  KAR: 'Karnataka',
  TN: 'Tamil Nadu',
  BEN: 'Bengal',
  GUJ: 'Gujarat',
  MAH: 'Maharashtra',
  RAJ: 'Rajasthan',
  HYD: 'Hyderabad',
  UP: 'Uttar Pradesh',
  MP: 'Madhya Pradesh',
  PUN: 'Punjab',
  HP: 'Himachal Pradesh',
  JK: 'Jammu & Kashmir',
  KER: 'Kerala',
  ODS: 'Odisha',
  ORI: 'Odisha',
  ASM: 'Assam',
  TRI: 'Tripura',
  SER: 'Services',
  RLYS: 'Railways',
  RLW: 'Railways',
  VID: 'Vidarbha',
  BAR_DOM: 'Baroda',
  SAU: 'Saurashtra',
  BRD: 'Baroda',
  BAR_DOM: 'Baroda',
  GOA: 'Goa',
  HAR: 'Haryana',
  BIH: 'Bihar',
  JHK: 'Jharkhand',
  JHKD: 'Jharkhand',
  CG: 'Chhattisgarh',
  UKD: 'Uttarakhand',
  UTK: 'Uttarakhand',
  AP: 'Andhra',
  MEG: 'Meghalaya',
  MZR: 'Mizoram',
  MIZ: 'Mizoram',
  NAG: 'Nagaland',
  MNP: 'Manipur',
  SKM: 'Sikkim',
  ARP: 'Arunachal Pradesh',
  ARNP: 'Arunachal Pradesh',
  PDY: 'Puducherry',
  PD: 'Puducherry',
  CHD: 'Chandigarh',
  // Cricbuzz code variants seen in the coverage report:
  SAUR: 'Saurashtra',
  ODSA: 'Odisha',
  MDP: 'Madhya Pradesh',
  JKS: 'Jammu & Kashmir',

  // ── Duleep Trophy zone teams ─────────────────────────────────────────────
  NZONE: 'North Zone',
  SZONE: 'South Zone',
  CZONE: 'Central Zone',
  EZONE: 'East Zone',
  WZONE: 'West Zone',

  // ── India A / Australia A / touring development sides ────────────────────
  INDA: 'India A',
  AUSA: 'Australia A',
  SLCXI: 'Sri Lanka XI',

  // ── English County Championship / T20 Blast / One-Day Cup ────────────────
  DERBY: 'Derbyshire',
  DUR: 'Durham',
  ESS: 'Essex',
  GLAM: 'Glamorgan',
  HAM: 'Hampshire',
  KENT: 'Kent',
  LANCS: 'Lancashire',
  LEIC: 'Leicestershire',
  MDX: 'Middlesex',
  NHNTS: 'Northamptonshire',
  NOTTS: 'Nottinghamshire',
  SOM: 'Somerset',
  SUS: 'Sussex',
  WARKS: 'Warwickshire',
  WORCS: 'Worcestershire',

  // ── Hundred code variants ────────────────────────────────────────────────
  TRE: 'Trent Rockets',
  TREW: 'Trent Rockets Women',

  // ── ICC Associate nations (T20I qualifiers, CWC League) ──────────────────
  BHR: 'Bahrain',
  HKC: 'Hong Kong',
  SIN: 'Singapore',
  TAN: 'Tanzania',
  UGA: 'Uganda',
  ITA: 'Italy',
  MEX: 'Mexico',
};

// Deliberately NOT mapped (ambiguous, no confident public reference):
// CDG, CDK, CSG, DGD, GAG, MGLY, MIL, MILW, MSG, MSGW, NDS, NDT, NGL, PDC,
// PER, SAL, SDS, SUL, SULW, TBC, VKK, WELW.
// TBC is Cricbuzz's placeholder for unresolved fixtures — leave those rows
// alone so match teams resolve naturally once the schedule fills in.

/**
 * Merge `oldTeam` into `keeper`: repoint every match FK, merge providerRefs,
 * fill blank fields on the keeper, then delete the old row.
 */
async function mergeInto(
  oldId: string,
  keeper: { id: string; providerRefs: unknown; shortName: string | null; logoUrl: string | null },
  keptShortCandidate: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.match.updateMany({ where: { homeTeamId: oldId }, data: { homeTeamId: keeper.id } });
    await tx.match.updateMany({ where: { awayTeamId: oldId }, data: { awayTeamId: keeper.id } });
    // teamCompetition PK is (teamId, competitionId) — collapse dupes safely.
    const oldLinks = await tx.teamCompetition.findMany({ where: { teamId: oldId } });
    for (const link of oldLinks) {
      await tx.teamCompetition.deleteMany({ where: { teamId: oldId, competitionId: link.competitionId } });
      await tx.teamCompetition
        .upsert({
          where: { teamId_competitionId: { teamId: keeper.id, competitionId: link.competitionId } },
          update: {},
          create: { teamId: keeper.id, competitionId: link.competitionId },
        })
        .catch(() => undefined);
    }
    await tx.player.updateMany({ where: { teamId: oldId }, data: { teamId: keeper.id } });

    const oldRow = await tx.team.findUnique({ where: { id: oldId } });
    const mergedRefs = Array.isArray(keeper.providerRefs) ? [...keeper.providerRefs] : [];
    const oldRefs = Array.isArray(oldRow?.providerRefs) ? oldRow?.providerRefs : [];
    for (const r of oldRefs as Array<{ provider?: string; externalId?: string }>) {
      const dup = mergedRefs.find(
        (m: { provider?: string; externalId?: string }) =>
          m.provider === r.provider && m.externalId === r.externalId,
      );
      if (!dup) mergedRefs.push(r);
    }

    await tx.team.update({
      where: { id: keeper.id },
      data: {
        shortName: keeper.shortName ?? keptShortCandidate,
        logoUrl: keeper.logoUrl ?? oldRow?.logoUrl ?? null,
        providerRefs: mergedRefs as unknown as object,
      },
    });
    await tx.team.delete({ where: { id: oldId } });
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  if (dryRun) console.log('DRY RUN — no writes will happen.\n');

  const cricketTeams = await prisma.team.findMany({
    where: { sportId: 'cricket' },
    select: { id: true, name: true, shortName: true, logoUrl: true, providerRefs: true },
  });

  let translated = 0;
  let merged = 0;
  let alreadyCanonical = 0;
  let unmatched = 0;
  const missing: string[] = [];

  for (const t of cricketTeams) {
    const canonical = SHORTCODE_TO_NAME[t.name];
    if (canonical) {
      if (canonical === t.name) {
        alreadyCanonical += 1;
        continue;
      }
      if (dryRun) {
        translated += 1;
        continue;
      }
      // A row with the canonical name may already exist — merge into it.
      const keeper = await prisma.team.findFirst({
        where: { sportId: 'cricket', name: canonical, NOT: { id: t.id } },
        select: { id: true, providerRefs: true, shortName: true, logoUrl: true },
      });
      if (keeper) {
        await mergeInto(t.id, keeper, t.shortName ?? t.name);
        merged += 1;
      } else {
        await prisma.team.update({
          where: { id: t.id },
          data: {
            name: canonical,
            shortName: t.shortName ?? t.name,
          },
        });
        translated += 1;
      }
      continue;
    }
    // Skip rows that are clearly already full names.
    if (t.name.length >= 6 || /\s/.test(t.name) || /^[A-Z][a-z]/.test(t.name)) {
      alreadyCanonical += 1;
      continue;
    }
    unmatched += 1;
    missing.push(t.name);
  }

  console.log(`cricket teams total  = ${cricketTeams.length}`);
  console.log(`translated           = ${translated}`);
  console.log(`merged into existing = ${merged}`);
  console.log(`already canonical    = ${alreadyCanonical}`);
  console.log(`unmatched shortcodes = ${unmatched}`);
  if (missing.length > 0) {
    console.log('\nUnmatched (extend SHORTCODE_TO_NAME to translate these):');
    for (const m of [...new Set(missing)].sort()) console.log(`  ${m}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
