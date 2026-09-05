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
  CalendarEventRow,
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
  standing: {
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
  } | null;
};

/* -------------------------------------------------------------------------- */

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

  const cal = useQuery({
    queryKey: ['team', teamId, 'history'],
    queryFn: () =>
      api<CalendarResponse>(
        `/api/me/calendar?entity=${encodeURIComponent(teamId)}&from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
      ),
    enabled: Boolean(teamId),
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
  const totalMatches = resultCount + upcomingCount;

  const [view, setView] = useState<'upcoming' | 'results'>('upcoming');

  // Telemetry tiles: prefer the ingested standings row; fall back to values
  // computed from the fetched match history so tiles never show fake data.
  const standing = summary.data?.standing ?? null;
  const telemetry = useMemo(
    () => buildTelemetry(standing, resultDays, teamId),
    [standing, resultDays, teamId],
  );

  const nextMatch = upcomingDays[0]?.matches[0] ?? null;
  const laterUpcoming = useMemo(() => {
    if (!nextMatch) return upcomingDays;
    const rest: CalendarDay[] = [];
    for (const day of upcomingDays) {
      const matches = day.matches.filter((m) => m.id !== nextMatch.id);
      if (matches.length > 0) rest.push({ date: day.date, matches });
    }
    return rest;
  }, [upcomingDays, nextMatch]);

  const compBadges = useMemo(() => {
    const names = (summary.data?.competitions ?? [])
      .map((c) => c.name)
      .filter((n, i, a) => a.indexOf(n) === i)
      .slice(0, 3);
    return names;
  }, [summary.data]);

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

        <Animated.View entering={FadeInDown.duration(280)} style={styles.hero}>
          {compBadges.length > 0 ? (
            <View style={styles.badgeRow}>
              {compBadges.map((name, i) => (
                <View
                  key={name}
                  style={[
                    styles.compBadge,
                    {
                      borderColor: i === 0 ? withAlpha(accent, 0.45) : theme.color.border,
                      backgroundColor: i === 0 ? withAlpha(accent, 0.08) : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.compBadgeText,
                      { color: i === 0 ? accent : theme.color.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {name.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.crestWrap, { borderColor: withAlpha(accent, 0.5) }]}>
            <TeamCrest name={displayName} logoUrl={team?.logoUrl ?? null} size={72} accentColor={accent} />
          </View>
          <Text style={[styles.title, { color: theme.color.text }]} numberOfLines={2}>
            {displayName}
          </Text>
          <Text style={[styles.subtitleLine, { color: theme.color.textMuted }]} numberOfLines={1}>
            {[
              standing ? `${standing.competitionName} ${formatSeason(standing.season)}` : (team?.sportLabel ?? params.sport ?? ''),
              summary.data?.team.country ?? null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.pill, { borderColor: theme.color.border }]}>
              <Text style={[styles.pillText, { color: theme.color.textMuted }]}>
                {totalMatches === 0
                  ? 'No recent matches'
                  : [resultCount ? `${resultCount} result${resultCount === 1 ? '' : 's'}` : null, upcomingCount ? `${upcomingCount} upcoming` : null]
                      .filter(Boolean)
                      .join(' · ')}
              </Text>
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
              `${displayName} has no recent results or upcoming fixtures in this window.`
            }
          />
        ) : view === 'upcoming' ? (
          <View style={styles.list}>
            {nextMatch ? (
              <>
                <View style={styles.nextHeaderRow}>
                  <Text style={[styles.sectionLabel, { color: accent, marginBottom: 0 }]}>
                    ● NEXT FIXTURE
                  </Text>
                  <Countdown startsAt={nextMatch.startsAt} variant="phrase" soonAccent={accent} size="sm" />
                </View>
                <NextMatchCard
                  match={nextMatch}
                  accent={accent}
                  tz={cal.data?.timezone}
                  onPress={() => openEvent(matchToEvent(nextMatch), cal.data?.timezone)}
                />
              </>
            ) : null}
            {laterUpcoming.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: theme.color.textFaint }]}>
                  LATER THIS SEASON
                </Text>
                {laterUpcoming.map((day, di) => (
                  <DayBlock
                    key={`u-${day.date}`}
                    day={day}
                    di={di}
                    tz={cal.data?.timezone}
                    onOpen={(m) => openEvent(matchToEvent(m), cal.data?.timezone)}
                  />
                ))}
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
            {resultDays.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: theme.color.textFaint }]}>
                  RECENT MATCHES · LAST {Math.min(resultCount, 99)} LOGGED
                </Text>
                {resultDays.map((day, di) => (
                  <DayBlock
                    key={`r-${day.date}`}
                    day={day}
                    di={di}
                    tz={cal.data?.timezone}
                    onOpen={(m) => openEvent(matchToEvent(m), cal.data?.timezone)}
                  />
                ))}
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

function DayBlock({
  day,
  di,
  tz,
  onOpen,
}: {
  day: CalendarDay;
  di: number;
  tz?: string;
  onOpen: (m: FeedMatch) => void;
}) {
  return (
    <Animated.View
      entering={FadeInUp.delay(40 * di).duration(240)}
      style={styles.daySection}
    >
      <DayHeader date={day.date} tz={tz} />
      <View style={{ gap: spacing[2] }}>
        {day.matches.map((m) => (
          <CalendarEventRow key={m.id} match={m} timezone={tz} onPress={() => onOpen(m)} />
        ))}
      </View>
    </Animated.View>
  );
}

function DayHeader({ date, tz }: { date: string; tz?: string }) {
  const theme = useTheme();
  const label = formatDayHeader(date, tz);
  return (
    <View style={styles.dayHeader}>
      <Text style={[styles.dayLabel, { color: theme.color.text }]}>{label.title}</Text>
      <Text style={[styles.dayMeta, { color: theme.color.textFaint }]}>{label.meta}</Text>
    </View>
  );
}

function formatDayHeader(ymd: string, _tz?: string): { title: string; meta: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const local = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const todayYmd = new Date().toISOString().slice(0, 10);
  const tomorrowYmd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let title = local.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  if (ymd === todayYmd) title = 'Today';
  else if (ymd === tomorrowYmd) title = 'Tomorrow';
  const meta = local.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return { title, meta: title === meta ? '' : meta };
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
  onPress,
}: {
  match: FeedMatch;
  accent: string;
  tz?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const kickoff = formatLocalTime(match.startsAt, tz);
  const dateLabel = new Date(match.startsAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        nextStyles.card,
        {
          backgroundColor: theme.color.surface,
          borderColor: withAlpha(accent, 0.35),
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={[nextStyles.accent, { backgroundColor: accent }]} />
      <View style={nextStyles.headerRow}>
        <Text style={[nextStyles.comp, { color: accent }]} numberOfLines={1}>
          {match.competition.label.toUpperCase()}
        </Text>
        {match.round ? (
          <Text style={[nextStyles.round, { color: theme.color.textFaint }]} numberOfLines={1}>
            {match.round.toUpperCase()}
          </Text>
        ) : null}
      </View>

      <View style={nextStyles.vsRow}>
        <View style={nextStyles.teamCol}>
          <TeamCrest
            name={match.homeTeam?.name ?? '—'}
            logoUrl={match.homeTeam?.logoUrl ?? undefined}
            size={56}
            accentColor={accent}
          />
          <Text style={[nextStyles.teamName, { color: theme.color.text }]} numberOfLines={1}>
            {match.homeTeam?.shortName ?? match.homeTeam?.name ?? '—'}
          </Text>
          <Text style={[nextStyles.homeAway, { color: theme.color.textFaint }]}>HOME</Text>
        </View>
        <View style={nextStyles.centerCol}>
          <Text style={[nextStyles.vs, { color: theme.color.textFaint }]}>VS</Text>
          <Text style={[nextStyles.kickoff, { color: theme.color.text }]}>{kickoff}</Text>
          <Text style={[nextStyles.kickoffDate, { color: theme.color.textMuted }]}>{dateLabel}</Text>
        </View>
        <View style={nextStyles.teamCol}>
          <TeamCrest
            name={match.awayTeam?.name ?? '—'}
            logoUrl={match.awayTeam?.logoUrl ?? undefined}
            size={56}
            accentColor={accent}
          />
          <Text style={[nextStyles.teamName, { color: theme.color.text }]} numberOfLines={1}>
            {match.awayTeam?.shortName ?? match.awayTeam?.name ?? '—'}
          </Text>
          <Text style={[nextStyles.homeAway, { color: theme.color.textFaint }]}>AWAY</Text>
        </View>
      </View>

      {match.venue ? (
        <View style={[nextStyles.venueRow, { borderTopColor: theme.color.border }]}>
          <Text style={[nextStyles.venueText, { color: theme.color.textMuted }]} numberOfLines={1}>
            {match.venue}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const nextStyles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing[5],
    overflow: 'hidden',
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
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  comp: { fontSize: 11, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.bodyBold, flexShrink: 1 },
  round: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, fontFamily: fonts.bodyBold },
  vsRow: { flexDirection: 'row', alignItems: 'center' },
  teamCol: { flex: 1, alignItems: 'center', gap: spacing[2] },
  centerCol: { alignItems: 'center', paddingHorizontal: spacing[3], gap: 2 },
  vs: { fontSize: 13, fontWeight: '700', letterSpacing: 2, fontFamily: fonts.data },
  kickoff: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'], fontFamily: fonts.display },
  kickoffDate: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, fontFamily: fonts.data },
  teamName: { fontSize: 14, fontWeight: '600', textAlign: 'center', fontFamily: fonts.bodySemiBold, maxWidth: 110 },
  homeAway: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, fontFamily: fonts.bodyBold },
  venueRow: {
    marginTop: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  venueText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
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
