import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Countdown,
  EmptyState,
  ErrorState,
  Screen,
  SegmentedToggle,
  SettingsIcon,
  SkeletonCard,
  TeamCrest,
  useEventDetail,
} from '@/components';
import { fonts, haptics, radii, spacing, useTheme, type SportKey } from '@/design';
import { formatLocalTime } from '@/lib/time';
import { api } from '@/lib/api';
import { type FeedMatch, matchToEvent } from '@/lib/feed';

/* -------------------------------------------------------------------------- */
/*  Types (mirror /api/me/calendar)                                           */
/* -------------------------------------------------------------------------- */

type CalendarDay = {
  date: string; // YYYY-MM-DD in user tz
  matches: FeedMatch[];
};

type CalendarResponse = {
  timezone: string;
  from: string;
  to: string;
  days: CalendarDay[];
  totalMatches: number;
  empty: { kind: string; message: string } | null;
};

type FollowsTeam = {
  id: string;
  label: string;
  shortName: string | null;
  logoUrl: string | null;
};

type FollowsResponse = {
  sports: {
    id: string;
    label: string;
    teams: FollowsTeam[];
  }[];
};

type TeamSummary = {
  team: {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    country: string | null;
  };
  competitions: { id: string; name: string; format: string | null; season: string | null }[];
  standings?: TeamStanding[];
  standing: TeamStanding | null;
};

type TeamStanding = {
  competitionId?: string;
  competitionName: string;
  season: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string | null;
};

/* -------------------------------------------------------------------------- */

/**
 * Filter a list of match days to matches from a given competition (by name).
 * Declared as a const arrow up top so Metro/Hermes has it in scope for the
 * component's useMemo calls — plain function declarations don't always hoist
 * cleanly through the expo-router bundler transforms.
 */
const filterDaysByCompetition = (
  days: CalendarDay[],
  competitionName: string | null,
): CalendarDay[] => {
  if (!competitionName) return days;
  const target = competitionName.toLowerCase();
  const out: CalendarDay[] = [];
  for (const day of days) {
    const matches = day.matches.filter(
      (m) => (m.competition?.name ?? '').toLowerCase() === target,
    );
    if (matches.length > 0) out.push({ date: day.date, matches });
  }
  return out;
};

export default function TeamScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string | string[]; name?: string; sport?: string }>();
  const { openEvent } = useEventDetail();
  const [refreshing, setRefreshing] = useState(false);

  const teamId = Array.isArray(params.id) ? params.id[0] : params.id;

  // Hydrate team metadata from the follows list. This is guaranteed to be
  // present because we only ever navigate here from YourTeamsStrip, which
  // sources its list from the same endpoint.
  const follows = useQuery({
    queryKey: ['me', 'follows'],
    queryFn: () => api<FollowsResponse>('/api/me/follows'),
    staleTime: 60_000,
  });

  const team = useMemo(() => {
    if (!follows.data) return null;
    for (const s of follows.data.sports) {
      const t = s.teams.find((x) => x.id === teamId);
      if (t) return { ...t, sportId: s.id, sportLabel: s.label };
    }
    return null;
  }, [follows.data, teamId]);

  // Next 90 days of history + 60 days upcoming so a missed match is still here.
  const rangeFrom = useMemo(
    () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const rangeTo = useMemo(
    () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );

  // F1 sessions have no home/away teams — every race is a shared event and
  // constructors participate collectively. Filtering by `entity=<team>` on
  // /me/calendar returns nothing in that case. When the followed team is an
  // F1 constructor, fall back to a sport-scoped fetch so the page shows the
  // races the user's already tracking under this team's context.
  const isF1Team = team?.sportId === 'f1';
  const cal = useQuery({
    queryKey: ['team', teamId, 'history', isF1Team ? 'sport:f1' : 'entity'],
    queryFn: () => {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      if (isF1Team) params.set('sport', 'f1');
      else params.set('entity', teamId);
      return api<CalendarResponse>(`/api/me/calendar?${params.toString()}`);
    },
    enabled: Boolean(teamId) && (isF1Team || Boolean(team) || follows.isPending === false),
  });

  // Hero telemetry: standings row (rank / points / form / goal diff).
  const summary = useQuery({
    queryKey: ['team', teamId, 'summary'],
    queryFn: () => api<TeamSummary>(`/api/catalog/teams/${encodeURIComponent(teamId)}/summary`),
    enabled: Boolean(teamId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const onRefresh = useCallback(async () => {
    haptics.select();
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['team', teamId, 'history'] });
    } finally {
      setRefreshing(false);
    }
  }, [qc, teamId]);

  const accent = team
    ? (theme.sport[team.sportId as SportKey] ?? theme.color.accent)
    : theme.color.accent;

  const displayName = team?.label ?? params.name ?? 'Team';
  const days = cal.data?.days ?? [];
  const { resultDays, upcomingDays, resultCount, upcomingCount } = useMemo(
    () => splitHistory(days),
    [days],
  );

  const [view, setView] = useState<'upcoming' | 'results'>('upcoming');

  // Ordered competition list — domestic leagues first, then supra-national
  // (UCL, EL, ECL), then cups. Also dedupes by name.
  const compChips = useMemo(() => {
    const comps = summary.data?.competitions ?? [];
    const isSupra = (n: string) => /^(UEFA|CONMEBOL|CONCACAF|AFC|CAF)\b/i.test(n);
    const priority = (c: { name: string; format: string | null }) => {
      if (isSupra(c.name)) return 2;
      if (c.format === 'cup') return 3;
      return 1; // domestic league
    };
    const seen = new Set<string>();
    const uniq = comps.filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
    return uniq.sort((a, b) => priority(a) - priority(b));
  }, [summary.data]);

  // User-selected competition (defaults to first — the domestic league).
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const activeCompId = selectedCompId ?? compChips[0]?.id ?? null;
  const activeComp = compChips.find((c) => c.id === activeCompId) ?? null;

  // Standing for the active competition (falls back to summary.standing).
  const allStandings = summary.data?.standings ?? [];
  const standing: TeamStanding | null = useMemo(() => {
    if (activeCompId) {
      const match = allStandings.find((s) => s.competitionId === activeCompId);
      if (match) return match;
    }
    return summary.data?.standing ?? null;
  }, [allStandings, activeCompId, summary.data]);

  // Filter fixtures/results to the active competition if one is chosen and
  // multiple exist. If the user hasn't switched (or there's only one), show
  // everything so team pages stay useful.
  const filterByComp = compChips.length > 1 && activeComp;
  const activeCompName = activeComp?.name ?? null;
  const filteredResultDays = useMemo(
    () => (filterByComp ? filterDaysByCompetition(resultDays, activeCompName) : resultDays),
    [filterByComp, resultDays, activeCompName],
  );
  const filteredUpcomingDays = useMemo(
    () => (filterByComp ? filterDaysByCompetition(upcomingDays, activeCompName) : upcomingDays),
    [filterByComp, upcomingDays, activeCompName],
  );

  // Telemetry tiles: prefer the ingested standings row; fall back to values
  // computed from the fetched match history so tiles never show fake data.
  const telemetry = useMemo(
    () => buildTelemetry(standing, filteredResultDays, teamId),
    [standing, filteredResultDays, teamId],
  );

  const nextMatch = filteredUpcomingDays[0]?.matches[0] ?? null;
  const laterUpcoming = useMemo(() => {
    if (!nextMatch) return filteredUpcomingDays;
    const rest: CalendarDay[] = [];
    for (const day of filteredUpcomingDays) {
      const matches = day.matches.filter((m) => m.id !== nextMatch.id);
      if (matches.length > 0) rest.push({ date: day.date, matches });
    }
    return rest;
  }, [filteredUpcomingDays, nextMatch]);

  return (
    <Screen edges={['top']}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.color.accent}
            colors={[theme.color.accent]}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => {
              haptics.light();
              router.back();
            }}
            hitSlop={12}
            style={styles.back}
          >
            <SettingsIcon name="chevron-right" color={theme.color.text} size={20} />
          </Pressable>
        </View>

        <Animated.View entering={FadeInDown.duration(280)} style={{ paddingHorizontal: spacing[4] }}>
          <View
            style={[
              styles.heroCard,
              { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border },
            ]}
          >
            {/* Ambient glow at top — approximates the design's radial gradient. */}
            <View
              pointerEvents="none"
              style={[
                styles.heroGlow,
                { backgroundColor: withAlpha(accent, 0.06) },
              ]}
            />

            {compChips.length > 0 ? (
              <View style={styles.badgeRow}>
                {compChips.map((comp) => {
                  const isActive = comp.id === activeCompId;
                  return (
                    <Pressable
                      key={comp.id}
                      onPress={() => {
                        if (comp.id === activeCompId) return;
                        haptics.light();
                        setSelectedCompId(comp.id);
                      }}
                      hitSlop={6}
                      style={[
                        styles.compBadge,
                        {
                          borderColor: isActive ? withAlpha(accent, 0.55) : theme.color.border,
                          backgroundColor: isActive
                            ? withAlpha(accent, 0.14)
                            : theme.color.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.compBadgeText,
                          { color: isActive ? accent : theme.color.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {comp.name.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Crest halo lockup */}
            {/* Layered dark tile lockup (Stitch): elevated grey ring, no neon. */}
            <View
              style={[
                styles.crestHalo,
                { backgroundColor: theme.color.bgElevated, borderColor: theme.color.border },
              ]}
            >
              <View
                style={[
                  styles.crestWrap,
                  { borderColor: theme.color.border, backgroundColor: theme.color.surface },
                ]}
              >
                <TeamCrest
                  name={displayName}
                  logoUrl={team?.logoUrl ?? null}
                  size={72}
                  accentColor={accent}
                />
              </View>
            </View>

            <Text style={[styles.title, { color: theme.color.text }]} numberOfLines={2}>
              {displayName}
            </Text>
            <Text
              style={[styles.subtitleLine, { color: theme.color.textMuted }]}
              numberOfLines={1}
            >
              {[
                standing
                  ? `${standing.competitionName} ${formatSeason(standing.season)}`
                  : (team?.sportLabel ?? params.sport ?? ''),
                summary.data?.team.country ?? null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            {/* Feed status pill row */}
            <View
              style={[
                styles.feedRow,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <View style={styles.feedItem}>
                <View style={[styles.feedDot, { backgroundColor: accent }]} />
                <Text style={[styles.feedText, { color: theme.color.text }]}>OFFICIAL FEED</Text>
              </View>
              <Text style={[styles.feedDivider, { color: theme.color.textFaint }]}>•</Text>
              <View style={styles.feedItem}>
                <View
                  style={[styles.feedDot, { backgroundColor: theme.color.textMuted }]}
                />
                <Text style={[styles.feedText, { color: theme.color.text }]}>
                  AUTO-SYNCED CALENDAR
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.pill, { borderColor: theme.color.border }]}>
                <Text style={[styles.pillText, { color: theme.color.textMuted }]}>
                  {(() => {
                    const rCount = filteredResultDays.reduce((n, d) => n + d.matches.length, 0);
                    const uCount = filteredUpcomingDays.reduce((n, d) => n + d.matches.length, 0);
                    const total = rCount + uCount;
                    if (total === 0) return 'No recent matches';
                    return [
                      rCount ? `${rCount} result${rCount === 1 ? '' : 's'}` : null,
                      uCount ? `${uCount} upcoming` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                  })()}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Telemetry tiles — table rank / last-5 form / goal diff */}
        {telemetry ? (
          <Animated.View entering={FadeInUp.delay(60).duration(240)} style={styles.statsBar}>
            <View style={[styles.statsCard, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
              <View style={[styles.statsAccent, { backgroundColor: accent }]} />
              <View style={styles.statTile}>
                <Text style={[styles.statLabel, { color: theme.color.textFaint }]}>TABLE RANK</Text>
                <Text style={[styles.statValue, { color: theme.color.text }]}>
                  {telemetry.rank ?? '—'}
                </Text>
                <Text style={[styles.statSub, { color: telemetry.rank ? accent : theme.color.textFaint }]} numberOfLines={1}>
                  {telemetry.rankSub}
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.color.border }]} />
              <View style={styles.statTile}>
                <Text style={[styles.statLabel, { color: theme.color.textFaint }]}>LAST 5 FORM</Text>
                <View style={styles.formRow}>
                  {telemetry.form.length > 0 ? (
                    telemetry.form.map((r, i) => (
                      <View
                        key={`${r}-${i}`}
                        style={[
                          styles.formChip,
                          {
                            backgroundColor:
                              r === 'W'
                                ? withAlpha('#2DD4BF', 0.16)
                                : r === 'L'
                                  ? withAlpha('#EF4444', 0.16)
                                  : theme.color.bgSunken,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.formChipText,
                            {
                              color:
                                r === 'W' ? '#2DD4BF' : r === 'L' ? '#EF4444' : theme.color.textMuted,
                            },
                          ]}
                        >
                          {r}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.statValue, { color: theme.color.textFaint }]}>—</Text>
                  )}
                </View>
                <Text style={[styles.statSub, { color: theme.color.textFaint }]} numberOfLines={1}>
                  {telemetry.formSub}
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.color.border }]} />
              <View style={styles.statTile}>
                <Text style={[styles.statLabel, { color: theme.color.textFaint }]}>GOAL DIFF</Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color:
                        telemetry.goalDiff == null
                          ? theme.color.textFaint
                          : telemetry.goalDiff >= 0
                            ? '#2DD4BF'
                            : '#EF4444',
                    },
                  ]}
                >
                  {telemetry.goalDiff == null
                    ? '—'
                    : `${telemetry.goalDiff >= 0 ? '+' : ''}${telemetry.goalDiff}`}
                </Text>
                <Text style={[styles.statSub, { color: theme.color.textFaint }]} numberOfLines={1}>
                  {telemetry.goalDiffSub}
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* View toggle */}
        <View style={styles.toggleWrap}>
          <SegmentedToggle
            options={[
              { id: 'upcoming', label: 'Upcoming Fixtures' },
              { id: 'results', label: 'Results & Log' },
            ]}
            value={view}
            onChange={setView}
            size="md"
            accessibilityLabel="Switch between upcoming fixtures and results"
          />
        </View>

        {/* Body */}
        {cal.status === 'pending' ? (
          <View style={{ gap: spacing[3], paddingHorizontal: spacing[5], marginTop: spacing[6] }}>
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
          </View>
        ) : cal.status === 'error' ? (
          <ErrorState onRetry={() => void cal.refetch()} />
        ) : days.length === 0 ? (
          <EmptyState
            title="Nothing on the sheet"
            description={
              cal.data?.empty?.message ??
              (isF1Team
                ? 'No F1 sessions in this window. Follow the Formula 1 category on the Explore tab to pull in every race weekend.'
                : `${displayName} has no recent results or upcoming fixtures in this window.`)
            }
          />
        ) : view === 'upcoming' ? (
          <View style={styles.list}>
            {nextMatch ? (
              <>
                <View style={styles.nextHeaderRow}>
                  <View style={styles.sectionHeaderInner}>
                    <View style={[styles.sectionAccentBar, { backgroundColor: accent }]} />
                    <Text style={[styles.sectionLabel, { color: theme.color.text, marginBottom: 0 }]}>
                      NEXT FIXTURE
                    </Text>
                  </View>
                  <Countdown startsAt={nextMatch.startsAt} variant="phrase" soonAccent={accent} size="sm" />
                </View>
                <NextMatchCard
                  match={nextMatch}
                  accent={accent}
                  tz={cal.data?.timezone}
                  teamId={teamId}
                  homeStanding={standing}
                  onPress={() => openEvent(matchToEvent(nextMatch), cal.data?.timezone)}
                />
              </>
            ) : null}
            {laterUpcoming.length > 0 ? (
              <>
                <View style={styles.sectionHeaderInner}>
                  <View style={[styles.sectionAccentBar, { backgroundColor: withAlpha(accent, 0.5) }]} />
                  <Text style={[styles.sectionLabel, { color: theme.color.text, marginBottom: 0 }]}>
                    LATER THIS SEASON
                  </Text>
                </View>
                <View style={{ gap: spacing[2] }}>
                  {laterUpcoming
                    .flatMap((day) => day.matches)
                    .map((m, idx) => (
                      <Animated.View
                        key={`u-${m.id}`}
                        entering={FadeInUp.delay(Math.min(idx, 6) * 40).duration(220)}
                      >
                        <UpcomingFixtureRow
                          match={m}
                          teamId={teamId}
                          accent={accent}
                          tz={cal.data?.timezone}
                          showComp={!activeCompName}
                          onPress={() => openEvent(matchToEvent(m), cal.data?.timezone)}
                        />
                      </Animated.View>
                    ))}
                </View>
              </>
            ) : null}
            {!nextMatch && laterUpcoming.length === 0 ? (
              <EmptyState
                title="No upcoming fixtures"
                description="Nothing scheduled in the next 60 days. Check Results & Log for recent matches."
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {filteredResultDays.length > 0 ? (
              <>
                <SeasonRecordBanner
                  days={filteredResultDays}
                  teamId={teamId}
                  accent={accent}
                  compLabel={activeComp?.name ?? null}
                />
                <View style={styles.resultsHeaderRow}>
                  <View style={[styles.sectionHeaderInner, { flex: 1, minWidth: 0 }]}>
                    <View style={[styles.sectionAccentBar, { backgroundColor: accent }]} />
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: theme.color.text, marginBottom: 0, flexShrink: 1 },
                      ]}
                      numberOfLines={1}
                    >
                      MATCH LOGS
                    </Text>
                  </View>
                  <Text
                    style={[styles.resultsHeaderMeta, { color: theme.color.textFaint }]}
                    numberOfLines={1}
                  >
                    NEWEST FIRST
                  </Text>
                </View>
                {flattenNewestFirst(filteredResultDays).map((m, idx) => (
                  <Animated.View
                    key={`r-${m.id}`}
                    entering={FadeInUp.delay(Math.min(idx, 6) * 40).duration(220)}
                  >
                    <ResultLogCard
                      match={m}
                      teamId={teamId}
                      accent={accent}
                      tz={cal.data?.timezone}
                      onPress={() => openEvent(matchToEvent(m), cal.data?.timezone)}
                    />
                  </Animated.View>
                ))}
                <Pressable
                  onPress={() => {
                    haptics.light();
                    router.push('/settings/calendar');
                  }}
                  style={({ pressed }) => [
                    styles.exportBtn,
                    {
                      backgroundColor: theme.color.surface,
                      borderColor: theme.color.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.exportBtnText, { color: theme.color.textMuted }]}>
                    ⬇  EXPORT SEASON LOG (.ICS)
                  </Text>
                </Pressable>
              </>
            ) : (
              <EmptyState
                title="No results yet"
                description="Finished matches from the last 90 days will appear here with scores."
              />
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function isFinished(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'completed' || s === 'complete' || s === 'ft' || s === 'finished' || s === 'final';
}

function splitHistory(days: CalendarDay[]): {
  resultDays: CalendarDay[];
  upcomingDays: CalendarDay[];
  resultCount: number;
  upcomingCount: number;
} {
  const resultDays: CalendarDay[] = [];
  const upcomingDays: CalendarDay[] = [];
  let resultCount = 0;
  let upcomingCount = 0;
  for (const day of days) {
    const finished = day.matches.filter((m) => isFinished(m.status));
    const rest = day.matches.filter((m) => !isFinished(m.status));
    if (rest.length > 0) {
      upcomingDays.push({ date: day.date, matches: rest });
      upcomingCount += rest.length;
    }
    if (finished.length > 0) {
      resultDays.push({ date: day.date, matches: finished });
      resultCount += finished.length;
    }
  }
  resultDays.reverse();
  return { resultDays, upcomingDays, resultCount, upcomingCount };
}

function withAlpha(hex: string, a: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function formatSeason(season: string | null): string {
  if (!season) return '';
  // "2025" → "2025/26" when it's a cross-year league season string like "2025-2026"
  const m = season.match(/^(\d{4})[-/](\d{2,4})$/);
  if (m) return `${m[1]}/${m[2].slice(-2)}`;
  return season;
}

type Telemetry = {
  rank: string | null;
  rankSub: string;
  form: string[];
  formSub: string;
  goalDiff: number | null;
  goalDiffSub: string;
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Build the hero telemetry from the standings row when we have one, falling
 * back to values computed from the fetched 90-day match history. Only real
 * data ever reaches a tile — anything unknown renders as "—".
 */
function buildTelemetry(
  standing: TeamSummary['standing'],
  resultDays: CalendarDay[],
  teamId: string,
): Telemetry | null {
  // History-derived fallback (resultDays are newest-first).
  const recent: { r: 'W' | 'D' | 'L'; gf: number; ga: number }[] = [];
  for (const day of resultDays) {
    for (const m of day.matches) {
      if (!m.homeTeam || !m.awayTeam || m.score.home == null || m.score.away == null) continue;
      const isHome = m.homeTeam.id === teamId;
      const gf = isHome ? m.score.home : m.score.away;
      const ga = isHome ? m.score.away : m.score.home;
      recent.push({ r: gf > ga ? 'W' : gf < ga ? 'L' : 'D', gf, ga });
    }
  }

  const fallbackForm = recent.slice(0, 5).map((x) => x.r);
  const fallbackGf = recent.reduce((a, x) => a + x.gf, 0);
  const fallbackGa = recent.reduce((a, x) => a + x.ga, 0);

  if (!standing && recent.length === 0) return null;

  if (standing) {
    const formArr = standing.form
      ? standing.form.replace(/[^WDLwdl]/g, '').toUpperCase().split('').slice(0, 5)
      : fallbackForm;
    return {
      rank: ordinal(standing.position),
      rankSub: `${standing.points} PTS · ${standing.played} PLAYED`,
      form: formArr,
      formSub: `${standing.won}W ${standing.drawn}D ${standing.lost}L`,
      goalDiff: standing.goalDifference,
      goalDiffSub: `${standing.goalsFor} : ${standing.goalsAgainst}`,
    };
  }

  return {
    rank: null,
    rankSub: 'TABLE NOT SYNCED',
    form: fallbackForm,
    formSub: `LAST ${Math.min(recent.length, 5)} MATCHES`,
    goalDiff: recent.length > 0 ? fallbackGf - fallbackGa : null,
    goalDiffSub: recent.length > 0 ? `${fallbackGf} : ${fallbackGa} · 90 DAYS` : '',
  };
}

/**
 * Hero card for the next fixture — big VS lockup with crests, kickoff time,
 * venue and competition, per the Obsidian Precision team-page design.
 */
function NextMatchCard({
  match,
  accent,
  tz,
  teamId,
  homeStanding,
  onPress,
}: {
  match: FeedMatch;
  accent: string;
  tz?: string;
  teamId: string;
  homeStanding: TeamStanding | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const kickoff = formatLocalTime(match.startsAt, tz);
  const dateLabel = new Date(match.startsAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Tag which side the followed team is on. We only know the followed team's
  // rank (from homeStanding) — the opponent's tag stays empty.
  const followedIsHome = match.homeTeam?.id === teamId;
  const followedIsAway = match.awayTeam?.id === teamId;
  const rankLabel =
    homeStanding?.position != null ? `${homeStanding.position}${ordinal(homeStanding.position)}` : null;
  const homeTag = followedIsHome && rankLabel ? `HOME (${rankLabel})` : 'HOME';
  const awayTag = followedIsAway && rankLabel ? `AWAY (${rankLabel})` : 'AWAY';

  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        nextStyles.card,
        {
          backgroundColor: theme.color.bgSunken,
          borderColor: withAlpha(accent, 0.35),
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={[nextStyles.accent, { backgroundColor: accent }]} />

      {/* Badges row */}
      <View style={nextStyles.headerRow}>
        <View style={nextStyles.badgeGroup}>
          <View
            style={[
              nextStyles.compPill,
              { backgroundColor: theme.color.surface, borderColor: withAlpha(accent, 0.35) },
            ]}
          >
            <Text style={[nextStyles.compPillText, { color: accent }]} numberOfLines={1}>
              {match.competition.label.toUpperCase()}
            </Text>
          </View>
          {displayRound(match.round) ? (
            <View
              style={[
                nextStyles.roundPill,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <Text
                style={[nextStyles.roundPillText, { color: theme.color.textMuted }]}
                numberOfLines={1}
              >
                {displayRound(match.round)!.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Face-off */}
      <View style={nextStyles.vsRow}>
        <View style={nextStyles.teamCol}>
          <TeamCrest
            name={match.homeTeam?.name ?? '—'}
            logoUrl={match.homeTeam?.logoUrl ?? undefined}
            size={52}
            accentColor={accent}
          />
          <Text style={[nextStyles.teamName, { color: theme.color.text }]} numberOfLines={1}>
            {match.homeTeam?.shortName ?? match.homeTeam?.name ?? '—'}
          </Text>
          <Text
            style={[
              nextStyles.homeAway,
              { color: followedIsHome ? accent : theme.color.textFaint },
            ]}
            numberOfLines={1}
          >
            {homeTag}
          </Text>
        </View>
        <View style={nextStyles.centerCol}>
          <Text style={[nextStyles.vs, { color: theme.color.textFaint }]}>VS</Text>
          <View
            style={[
              nextStyles.timePill,
              { backgroundColor: theme.color.surface, borderColor: theme.color.border },
            ]}
          >
            <Text style={[nextStyles.timePillText, { color: theme.color.text }]}>{kickoff}</Text>
          </View>
          <Text style={[nextStyles.kickoffDate, { color: theme.color.textMuted }]}>
            {dateLabel}
          </Text>
        </View>
        <View style={nextStyles.teamCol}>
          <TeamCrest
            name={match.awayTeam?.name ?? '—'}
            logoUrl={match.awayTeam?.logoUrl ?? undefined}
            size={52}
            accentColor={accent}
          />
          <Text style={[nextStyles.teamName, { color: theme.color.text }]} numberOfLines={1}>
            {match.awayTeam?.shortName ?? match.awayTeam?.name ?? '—'}
          </Text>
          <Text
            style={[
              nextStyles.homeAway,
              { color: followedIsAway ? accent : theme.color.textFaint },
            ]}
            numberOfLines={1}
          >
            {awayTag}
          </Text>
        </View>
      </View>

      {/* Meta strip */}
      {match.venue ? (
        <View style={[nextStyles.metaStrip, { backgroundColor: theme.color.surface }]}>
          <Text style={[nextStyles.metaText, { color: theme.color.textMuted }]} numberOfLines={1}>
            {match.venue}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Results & Log — Stitch-aligned                                            */
/* -------------------------------------------------------------------------- */

/**
 * Strip status strings that leak into the `round` field on older DB rows
 * (e.g. "FULL TIME", "Final", "FT"). New writes are sanitised at ingest,
 * but the results view still has to defend against legacy data.
 */
function displayRound(round: string | null): string | null {
  if (!round) return null;
  const s = round.trim().toLowerCase();
  if (
    s === '' ||
    s === 'ft' ||
    s === 'full time' ||
    s === 'fulltime' ||
    s === 'final' ||
    s === 'finished' ||
    s === 'completed' ||
    s === 'complete' ||
    s === 'ended' ||
    s === 'in progress' ||
    s === 'live' ||
    s === 'ongoing' ||
    s === 'scheduled' ||
    s === 'postponed' ||
    s === 'half time' ||
    s === 'halftime' ||
    s === 'ht'
  ) {
    return null;
  }
  return round;
}

function flattenNewestFirst(days: CalendarDay[]): FeedMatch[] {
  // `days` already comes newest-first from the API; within a day sort by
  // kickoff descending so the most recent match anchors the top.
  const out: FeedMatch[] = [];
  for (const day of days) {
    const sorted = [...day.matches].sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
    out.push(...sorted);
  }
  return out;
}

type Outcome = 'W' | 'D' | 'L' | 'U';

function outcomeFor(match: FeedMatch, teamId: string): Outcome {
  const h = match.score.home;
  const a = match.score.away;
  if (h == null || a == null) return 'U';
  const isHome = match.homeTeam?.id === teamId;
  const isAway = match.awayTeam?.id === teamId;
  if (!isHome && !isAway) return 'U';
  const my = isHome ? h : a;
  const other = isHome ? a : h;
  if (my > other) return 'W';
  if (my < other) return 'L';
  return 'D';
}

function SeasonRecordBanner({
  days,
  teamId,
  accent,
  compLabel,
}: {
  days: CalendarDay[];
  teamId: string;
  accent: string;
  compLabel: string | null;
}) {
  const theme = useTheme();
  const stats = useMemo(() => {
    let w = 0,
      d = 0,
      l = 0,
      gf = 0,
      ga = 0,
      cs = 0,
      n = 0;
    for (const day of days) {
      for (const m of day.matches) {
        const outcome = outcomeFor(m, teamId);
        if (outcome === 'U') continue;
        n += 1;
        if (outcome === 'W') w += 1;
        else if (outcome === 'D') d += 1;
        else if (outcome === 'L') l += 1;
        const isHome = m.homeTeam?.id === teamId;
        const my = isHome ? (m.score.home ?? 0) : (m.score.away ?? 0);
        const other = isHome ? (m.score.away ?? 0) : (m.score.home ?? 0);
        gf += my;
        ga += other;
        if (other === 0) cs += 1;
      }
    }
    const winRate = n > 0 ? Math.round((w / n) * 100) : 0;
    return { w, d, l, gf, ga, cs, n, winRate };
  }, [days, teamId]);

  if (stats.n === 0) return null;
  return (
    <View
      style={[
        seasonStyles.card,
        { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border },
      ]}
    >
      <View style={[seasonStyles.accent, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <View style={seasonStyles.headline}>
          <Text style={[seasonStyles.record, { color: theme.color.text }]}>
            {stats.w}W - {stats.d}D - {stats.l}L
          </Text>
          <View
            style={[seasonStyles.rateBadge, { backgroundColor: withAlpha(accent, 0.18) }]}
          >
            <Text style={[seasonStyles.rateBadgeText, { color: accent }]}>
              {stats.winRate}% WIN RATE
            </Text>
          </View>
        </View>
        <Text style={[seasonStyles.subtitle, { color: theme.color.textMuted }]}>
          {compLabel ? `${compLabel} · ` : 'All Comps · '}Across {stats.n} fixture
          {stats.n === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={seasonStyles.rightCol}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[seasonStyles.rightValue, { color: accent }]}>{stats.gf}</Text>
          <Text style={[seasonStyles.rightLabel, { color: theme.color.textFaint }]}>SCORED</Text>
        </View>
        <View style={[seasonStyles.rightDivider, { backgroundColor: theme.color.border }]} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[seasonStyles.rightValue, { color: theme.color.text }]}>{stats.cs}</Text>
          <Text style={[seasonStyles.rightLabel, { color: theme.color.textFaint }]}>
            CLEAN SHEETS
          </Text>
        </View>
      </View>
    </View>
  );
}

const seasonStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  record: { fontSize: 18, fontWeight: '700', fontFamily: fonts.display, letterSpacing: -0.2 },
  rateBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rateBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, fontFamily: fonts.bodyBold },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 4, fontFamily: fonts.bodyMedium },
  rightCol: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  rightValue: { fontSize: 16, fontWeight: '800', fontFamily: fonts.data, fontVariant: ['tabular-nums'] },
  rightLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 1,
    fontFamily: fonts.bodyBold,
  },
  rightDivider: { width: StyleSheet.hairlineWidth, height: 26 },
});

/**
 * Opponent-centric upcoming fixture row for the "Later this season" list.
 * Mirrors the Stitch secondary-fixture card: crest + "vs Opponent" +
 * home/away & venue on the left, stacked date/time on the right.
 */
function UpcomingFixtureRow({
  match,
  teamId,
  accent,
  tz,
  showComp,
  onPress,
}: {
  match: FeedMatch;
  teamId: string;
  accent: string;
  tz?: string;
  showComp: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isHome = match.homeTeam?.id === teamId;
  const opponent = isHome ? match.awayTeam : match.homeTeam;

  const dateLabel = new Date(match.startsAt)
    .toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: tz,
    })
    .toUpperCase();
  const timeLabel = formatLocalTime(match.startsAt, tz);

  const subtitleParts = [
    isHome ? 'Home' : 'Away',
    showComp ? match.competition.label : null,
    match.venue,
  ].filter(Boolean) as string[];

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={[
        upcomingStyles.card,
        { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border },
      ]}
    >
      <View style={[upcomingStyles.stripe, { backgroundColor: withAlpha(accent, 0.45) }]} />
      <View style={upcomingStyles.row}>
        <View
          style={[
            upcomingStyles.crestTile,
            { backgroundColor: theme.color.surface, borderColor: theme.color.border },
          ]}
        >
          <TeamCrest
            name={opponent?.name ?? '—'}
            logoUrl={opponent?.logoUrl ?? undefined}
            size={30}
            accentColor={null}
          />
        </View>
        <View style={upcomingStyles.middle}>
          <View style={upcomingStyles.titleRow}>
            <Text style={[upcomingStyles.vsPrefix, { color: theme.color.textFaint }]}>vs</Text>
            <Text
              style={[upcomingStyles.opponent, { color: theme.color.text }]}
              numberOfLines={1}
            >
              {opponent?.shortName ?? opponent?.name ?? 'TBC'}
            </Text>
          </View>
          <Text
            style={[upcomingStyles.subtitle, { color: theme.color.textMuted }]}
            numberOfLines={1}
          >
            {subtitleParts.join(' · ')}
          </Text>
        </View>
        <View style={upcomingStyles.right}>
          <Text style={[upcomingStyles.date, { color: theme.color.text }]} numberOfLines={1}>
            {dateLabel}
          </Text>
          <Text style={[upcomingStyles.time, { color: accent }]} numberOfLines={1}>
            {timeLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const upcomingStyles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  crestTile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  vsPrefix: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: fonts.bodyBold,
  },
  opponent: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
    flexShrink: 1,
  },
  subtitle: { fontSize: 11, fontWeight: '500', fontFamily: fonts.bodyMedium },
  right: { alignItems: 'flex-end', gap: 3 },
  date: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontFamily: fonts.data,
  },
  time: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    fontFamily: fonts.display,
  },
});

function ResultLogCard({
  match,
  teamId,
  accent,
  tz,
  onPress,
}: {
  match: FeedMatch;
  teamId: string;
  accent: string;
  tz?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const outcome = outcomeFor(match, teamId);
  const stripeColor =
    outcome === 'W'
      ? accent
      : outcome === 'L'
        ? '#EF4444'
        : outcome === 'D'
          ? theme.color.border
          : withAlpha(accent, 0.4);

  const scoreH = match.score.home ?? 0;
  const scoreA = match.score.away ?? 0;
  const scoreTint =
    outcome === 'W'
      ? withAlpha(accent, 0.18)
      : outcome === 'L'
        ? withAlpha('#EF4444', 0.16)
        : theme.color.bgSunken;
  const scoreFg =
    outcome === 'W' ? accent : outcome === 'L' ? '#EF4444' : theme.color.text;

  const isHome = match.homeTeam?.id === teamId;
  const cleanSheet =
    outcome === 'W' && ((isHome && scoreA === 0) || (!isHome && scoreH === 0));

  const badgeLabel =
    outcome === 'W'
      ? cleanSheet
        ? 'W · CLEAN SHEET'
        : 'W +3 PTS'
      : outcome === 'D'
        ? 'D +1 PT'
        : outcome === 'L'
          ? 'L · 0 PTS'
          : '—';
  const badgeBg =
    outcome === 'W'
      ? accent
      : outcome === 'L'
        ? withAlpha('#EF4444', 0.18)
        : theme.color.surface;
  const badgeFg =
    outcome === 'W' ? '#00201C' : outcome === 'L' ? '#EF4444' : theme.color.text;

  const subtitle =
    outcome === 'W'
      ? isHome
        ? 'HOME WIN'
        : 'AWAY WIN'
      : outcome === 'D'
        ? isHome
          ? 'HOME POINT'
          : 'AWAY POINT'
        : outcome === 'L'
          ? isHome
            ? 'HOME LOSS'
            : 'AWAY LOSS'
          : '';

  const dateLabel = new Date(match.startsAt).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  });

  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        resultStyles.card,
        {
          backgroundColor: theme.color.bgSunken,
          borderColor: theme.color.border,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={[resultStyles.stripe, { backgroundColor: stripeColor }]} />

      {/* Top meta row */}
      <View style={resultStyles.topRow}>
        <View style={resultStyles.topLeft}>
          <View
            style={[
              resultStyles.compPill,
              { backgroundColor: theme.color.surface, borderColor: withAlpha(accent, 0.35) },
            ]}
          >
            <Text style={[resultStyles.compPillText, { color: accent }]} numberOfLines={1}>
              {match.competition.label.toUpperCase()}
            </Text>
          </View>
          {displayRound(match.round) ? (
            <Text
              style={[resultStyles.roundText, { color: theme.color.textMuted }]}
              numberOfLines={1}
            >
              {displayRound(match.round)!.toUpperCase()}
            </Text>
          ) : null}
        </View>
        <Text style={[resultStyles.dateText, { color: theme.color.textFaint }]}>{dateLabel}</Text>
      </View>

      {/* Middle: score tile + teams + result badge */}
      <View style={resultStyles.midRow}>
        <View style={[resultStyles.scoreTile, { backgroundColor: scoreTint }]}>
          <Text style={[resultStyles.scoreFt, { color: scoreFg }]}>FT</Text>
          <Text style={[resultStyles.scoreLine, { color: scoreFg }]}>
            {scoreH}-{scoreA}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={resultStyles.teamsRow}>
            <Text
              style={[
                resultStyles.teamName,
                {
                  color: isHome ? theme.color.text : theme.color.textMuted,
                  fontFamily: isHome ? fonts.bodyBold : fonts.bodySemiBold,
                },
              ]}
              numberOfLines={1}
            >
              {match.homeTeam?.shortName ?? match.homeTeam?.name ?? '—'}
            </Text>
            <Text style={[resultStyles.vs, { color: theme.color.textFaint }]}>vs</Text>
            <Text
              style={[
                resultStyles.teamName,
                {
                  color: !isHome ? theme.color.text : theme.color.textMuted,
                  fontFamily: !isHome ? fonts.bodyBold : fonts.bodySemiBold,
                  flex: 1,
                },
              ]}
              numberOfLines={1}
            >
              {match.awayTeam?.shortName ?? match.awayTeam?.name ?? '—'}
            </Text>
          </View>
          {match.venue ? (
            <Text style={[resultStyles.venue, { color: theme.color.textMuted }]} numberOfLines={1}>
              {match.venue}
            </Text>
          ) : null}
        </View>
        <View style={resultStyles.badgeCol}>
          <View style={[resultStyles.resultBadge, { backgroundColor: badgeBg }]}>
            <Text style={[resultStyles.resultBadgeText, { color: badgeFg }]} numberOfLines={1}>
              {badgeLabel}
            </Text>
          </View>
          {subtitle ? (
            <Text
              style={[
                resultStyles.badgeSubtitle,
                {
                  color:
                    outcome === 'W'
                      ? accent
                      : outcome === 'L'
                        ? '#EF4444'
                        : theme.color.textMuted,
                },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const resultStyles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
    overflow: 'hidden',
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexShrink: 1 },
  compPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.bodyBold },
  roundText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.data },
  dateText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, fontFamily: fonts.data },
  midRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  scoreTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreFt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, fontFamily: fonts.bodyBold },
  scoreLine: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: fonts.display,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  vs: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  venue: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
    fontFamily: fonts.bodyMedium,
  },
  badgeCol: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },
  resultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  resultBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    fontFamily: fonts.bodyBold,
  },
  badgeSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: fonts.bodyBold,
  },
});

const nextStyles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing[5],
    overflow: 'hidden',
    gap: spacing[3],
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
  },
  compPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.bodyBold },
  roundPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  roundPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: fonts.bodyBold,
  },
  vsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[1] },
  teamCol: { flex: 1, alignItems: 'center', gap: spacing[2] },
  centerCol: { alignItems: 'center', paddingHorizontal: spacing[3], gap: spacing[1] },
  vs: { fontSize: 18, fontWeight: '700', letterSpacing: 2, fontFamily: fonts.display },
  timePill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timePillText: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    fontFamily: fonts.data,
  },
  kickoffDate: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: fonts.bodyBold,
    marginTop: 2,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
    maxWidth: 110,
  },
  homeAway: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: fonts.bodyBold,
  },
  metaStrip: {
    marginTop: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.btn,
    alignItems: 'center',
  },
  metaText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
});

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing[12] },
  headerBar: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '180deg' }],
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[5],
    gap: spacing[2],
  },
  heroCard: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
    alignItems: 'center',
    gap: spacing[2],
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  heroGlow: {
    position: 'absolute',
    top: -48,
    left: -40,
    right: -40,
    height: 160,
    borderRadius: 999,
    opacity: 0.7,
  },
  crestHalo: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[1],
    marginBottom: spacing[2],
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing[3],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  feedItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedDot: { width: 6, height: 6, borderRadius: 3 },
  feedText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.bodyBold },
  feedDivider: { fontSize: 12, fontWeight: '700' },
  sectionHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
  },
  sectionAccentBar: { width: 4, height: 14, borderRadius: 2 },
  resultsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    marginBottom: -spacing[2],
  },
  resultsHeaderMeta: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: fonts.bodyBold,
  },
  exportBtn: {
    alignSelf: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing[2],
  },
  exportBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: fonts.bodyBold,
  },
  crestWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
    fontFamily: fonts.display,
  },
  subtitleLine: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[3],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  compBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  compBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, fontFamily: fonts.bodyBold },
  metaRow: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },

  statsBar: { paddingHorizontal: spacing[5], marginTop: spacing[2] },
  statsCard: {
    flexDirection: 'row',
    borderRadius: radii.card,
    borderWidth: 1,
    paddingVertical: spacing[4],
    overflow: 'hidden',
  },
  statsAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  statTile: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: spacing[2] },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: spacing[1] },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.bodyBold },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
    fontFamily: fonts.display,
  },
  statSub: { fontSize: 9, fontWeight: '600', letterSpacing: 0.6, fontFamily: fonts.data },
  formRow: { flexDirection: 'row', gap: 3, alignItems: 'center', minHeight: 28 },
  formChip: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formChipText: { fontSize: 10, fontWeight: '800' },

  toggleWrap: { paddingHorizontal: spacing[5], marginTop: spacing[5] },
  nextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -spacing[2],
  },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: { fontSize: 12, fontWeight: '600' },

  list: { paddingHorizontal: spacing[5], marginTop: spacing[3], gap: spacing[6] },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: -spacing[2],
  },
  daySection: { gap: spacing[3] },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  dayLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  dayMeta: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
});
