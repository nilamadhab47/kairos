import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  CalendarEventRow,
  EmptyState,
  ErrorState,
  EventCard,
  Screen,
  SegmentedToggle,
  SkeletonCard,
  SportIcon,
  useEventDetail,
  type SportIconName,
} from '@/components';
import { fonts, haptics, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import { matchToEvent, type FeedMatch } from '@/lib/feed';
import { useCalendarView } from '@/lib/useCalendarView';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type CalendarDay = { date: string; matches: FeedMatch[] };

type CalendarResponse = {
  timezone: string;
  from: string;
  to: string;
  days: CalendarDay[];
  totalMatches: number;
  appliedFilters: {
    sport: string | null;
    competition: string | null;
    entity: string | null;
  };
  empty: { kind: 'no_subscriptions' | 'no_events_in_window'; message: string } | null;
  source: string;
};

type FollowsResponse = {
  totalFollows: number;
  sports: Array<{
    id: string;
    label: string;
    sortOrder: number;
    followedWhole: boolean;
    competitions: Array<{ id: string; label: string; logoUrl: string | null; country: string | null }>;
    teams: Array<{ id: string; label: string; shortName: string | null; logoUrl: string | null }>;
  }>;
};

const SPORT_ICONS: Record<string, SportIconName> = {
  football: 'football',
  cricket: 'cricket',
  f1: 'f1',
  tennis: 'tennis',
  basketball: 'basketball',
  hockey: 'hockey',
  baseball: 'baseball',
};

const VIEW_OPTIONS = [
  { id: 'cards' as const, label: 'Cards' },
  { id: 'list' as const, label: 'List' },
];

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function CalendarScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { openEvent } = useEventDetail();
  const { view, setView } = useCalendarView();
  const [refreshing, setRefreshing] = useState(false);

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [compFilter, setCompFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  // Stitch date-strip: tap a day cell to focus just that day, tap again to clear.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const range = useMemo(() => monthWindow(monthCursor), [monthCursor]);

  const followsQuery = useQuery({
    queryKey: ['me', 'follows'],
    queryFn: () => api<FollowsResponse>('/api/me/follows'),
    staleTime: 60_000,
  });

  const calendarQuery = useQuery({
    queryKey: [
      'me',
      'calendar',
      range.from.toISOString(),
      range.to.toISOString(),
      sportFilter,
      compFilter,
      teamFilter,
    ] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      if (sportFilter) params.set('sport', sportFilter);
      if (compFilter) params.set('competition', compFilter);
      if (teamFilter) params.set('entity', teamFilter);
      return api<CalendarResponse>(`/api/me/calendar?${params.toString()}`);
    },
    refetchOnWindowFocus: true,
  });

  const onRefresh = useCallback(async () => {
    haptics.select();
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me', 'calendar'] }),
        qc.invalidateQueries({ queryKey: ['me', 'follows'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const data = calendarQuery.data;
  const follows = followsQuery.data;
  const tz = data?.timezone;
  const cursorIsThisMonth = sameMonth(monthCursor, new Date());
  const activeSportFollow = useMemo(
    () => follows?.sports.find((s) => s.id === sportFilter) ?? null,
    [follows, sportFilter],
  );
  const eventCount = data?.totalMatches ?? 0;
  const hasFilters = Boolean(sportFilter || compFilter || teamFilter);

  const setSportSafely = (id: string | null) => {
    setSportFilter(id);
    setCompFilter(null);
    setTeamFilter(null);
    haptics.select();
  };

  const setMonthSafely = (updater: (c: Date) => Date) => {
    setMonthCursor(updater);
    setSelectedDay(null);
  };

  const todayYmd = ymdInTzLocal(new Date(), tz);
  const visibleDays = useMemo(() => {
    const days = data?.days ?? [];
    return selectedDay ? days.filter((d) => d.date === selectedDay) : days;
  }, [data, selectedDay]);

  /* --------------------------- render -------------------------- */

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.color.accent}
            colors={[theme.color.accent]}
          />
        }
      >
        {/* --- Page title + month nav + view switcher (Stitch header) --- */}
        <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
          <View style={styles.titleTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: theme.color.textFaint }]}>Calendar</Text>
            </View>
            <SegmentedToggle
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              accessibilityLabel="Calendar view"
            />
          </View>

          {/* ‹ SEPTEMBER 2026 › cluster + TODAY pill */}
          <View style={styles.monthRow}>
            <NavArrow direction="prev" onPress={() => setMonthSafely((c) => addMonths(c, -1))} />
            <View style={styles.monthLabelWrap}>
              <Text style={[styles.title, { color: theme.color.text }]} numberOfLines={1}>
                {monthNameOf(monthCursor).toUpperCase()}
              </Text>
              <Text style={[styles.yearLabel, { color: theme.color.accent }]}>
                {monthCursor.getFullYear()}
              </Text>
            </View>
            <NavArrow direction="next" onPress={() => setMonthSafely((c) => addMonths(c, 1))} />
            <View style={{ flex: 1 }} />
            {!cursorIsThisMonth || selectedDay ? (
              <Pressable
                onPress={() => {
                  haptics.light();
                  setMonthCursor(startOfMonth(new Date()));
                  setSelectedDay(null);
                }}
                style={[
                  styles.todayPill,
                  { borderColor: theme.color.border, backgroundColor: theme.color.bgElevated },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Jump to current month"
              >
                <View style={[styles.todayDot, { backgroundColor: theme.color.accent }]} />
                <Text style={[styles.todayPillText, { color: theme.color.text }]}>TODAY</Text>
              </Pressable>
            ) : (
              <Text style={[styles.rangeCount, { color: theme.color.textMuted }]}>
                {eventCount === 0
                  ? 'No events'
                  : `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`}
              </Text>
            )}
          </View>

          {/* Date strip carousel — one cell per day with fixtures */}
          {(data?.days.length ?? 0) > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateStrip}
              style={{ marginTop: spacing[3] }}
            >
              {(data?.days ?? []).map((day) => (
                <DayCell
                  key={day.date}
                  day={day}
                  isToday={day.date === todayYmd}
                  selected={selectedDay === day.date}
                  onPress={() => {
                    haptics.light();
                    setSelectedDay((cur) => (cur === day.date ? null : day.date));
                  }}
                />
              ))}
            </ScrollView>
          ) : null}
        </Animated.View>

        {/* --- Sticky filter bar --- */}
        <View style={[styles.stickyWrap, { backgroundColor: theme.color.bg }]}>
          <FilterChipRow
            follows={follows}
            sportFilter={sportFilter}
            onSelectSport={setSportSafely}
          />
          {activeSportFollow &&
          (activeSportFollow.competitions.length > 0 || activeSportFollow.teams.length > 0) ? (
            <SecondaryFilterRow
              sport={activeSportFollow}
              compFilter={compFilter}
              teamFilter={teamFilter}
              onSelectComp={(id) => {
                setCompFilter(id);
                setTeamFilter(null);
                haptics.select();
              }}
              onSelectTeam={(id) => {
                setTeamFilter(id);
                setCompFilter(null);
                haptics.select();
              }}
            />
          ) : null}
        </View>

        {/* --- Body --- */}
        {calendarQuery.status === 'pending' ? (
          <View style={{ gap: spacing[3], paddingHorizontal: spacing[5], marginTop: spacing[4] }}>
            <SkeletonCard height={view === 'cards' ? 172 : 76} />
            <SkeletonCard height={view === 'cards' ? 172 : 76} />
            <SkeletonCard height={view === 'cards' ? 172 : 76} />
          </View>
        ) : calendarQuery.status === 'error' ? (
          <ErrorState onRetry={() => void calendarQuery.refetch()} />
        ) : data?.empty?.kind === 'no_subscriptions' ? (
          <EmptyState
            title="Your calendar is quiet"
            description={data.empty.message}
            actionLabel="Manage follows"
            onAction={() => router.push('/(onboarding)/sports')}
          />
        ) : data?.days.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description={
              data.empty?.message ??
              (hasFilters
                ? 'No events from the teams and competitions you follow match this filter.'
                : 'Finished matches show as FT with the score. Flip months for earlier results, or follow Champions League to see the full UEFA calendar.')
            }
            actionLabel={hasFilters ? 'Clear filters' : undefined}
            onAction={
              hasFilters
                ? () => {
                    setSportFilter(null);
                    setCompFilter(null);
                    setTeamFilter(null);
                  }
                : undefined
            }
          />
        ) : view === 'cards' ? (
          <CardsBody
            days={visibleDays}
            tz={tz}
            onOpen={(m) => openEvent(matchToEvent(m), tz)}
          />
        ) : (
          <ListBody
            days={visibleDays}
            tz={tz}
            onOpen={(m) => openEvent(matchToEvent(m), tz)}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body — Cards (default, hero visual experience)                            */
/* -------------------------------------------------------------------------- */

function CardsBody({
  days,
  tz,
  onOpen,
}: {
  days: CalendarDay[];
  tz: string | undefined;
  onOpen: (m: FeedMatch) => void;
}) {
  return (
    <View>
      {days.map((day, di) => (
        <Animated.View
          key={day.date}
          entering={FadeIn.duration(180)}
          layout={Layout.springify()}
        >
          <DaySection date={day.date} tz={tz} count={day.matches.length}>
            <View style={styles.cardStack}>
              {day.matches.map((m, i) => (
                <Animated.View
                  key={m.id}
                  entering={FadeIn.delay(30 * i + di * 15).duration(200)}
                >
                  <EventCard
                    event={matchToEvent(m)}
                    timezone={tz}
                    onPress={() => onOpen(m)}
                  />
                </Animated.View>
              ))}
            </View>
          </DaySection>
        </Animated.View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body — List (dense secondary view)                                        */
/* -------------------------------------------------------------------------- */

function ListBody({
  days,
  tz,
  onOpen,
}: {
  days: CalendarDay[];
  tz: string | undefined;
  onOpen: (m: FeedMatch) => void;
}) {
  return (
    <View>
      {days.map((day, di) => (
        <Animated.View
          key={day.date}
          entering={FadeIn.duration(180)}
          layout={Layout.springify()}
        >
          <DaySection date={day.date} tz={tz} count={day.matches.length}>
            <View style={styles.rowStack}>
              {day.matches.map((m, i) => (
                <Animated.View
                  key={m.id}
                  entering={FadeIn.delay(20 * i + di * 10).duration(180)}
                >
                  <CalendarEventRow match={m} timezone={tz} onPress={() => onOpen(m)} />
                </Animated.View>
              ))}
            </View>
          </DaySection>
        </Animated.View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  DayCell — Stitch date-strip carousel cell                                 */
/* -------------------------------------------------------------------------- */

function DayCell({
  day,
  isToday,
  selected,
  onPress,
}: {
  day: CalendarDay;
  isToday: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const dayNum = day.date.slice(8, 10);
  const [y, m, d] = day.date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12))
    .toLocaleDateString(undefined, { weekday: 'short' })
    .toUpperCase();
  // Sport-coloured event dots, deduped, max 3 — like the mockup's strip.
  const sportIds = [...new Set(day.matches.map((x) => x.sportId))].slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show fixtures on ${day.date}`}
      style={[
        styles.dayCell,
        {
          backgroundColor: selected ? theme.color.bgElevated : theme.color.bgSunken,
          borderColor: selected
            ? withAlpha(theme.color.accent, 0.5)
            : isToday
              ? withAlpha(theme.color.accent, 0.3)
              : theme.color.border,
        },
      ]}
    >
      <Text
        style={[
          styles.dayCellWeekday,
          { color: selected || isToday ? theme.color.accent : theme.color.textFaint },
        ]}
      >
        {weekday}
      </Text>
      <Text style={[styles.dayCellNum, { color: theme.color.text }]}>{dayNum}</Text>
      <View style={styles.dayCellDots}>
        {sportIds.map((sid) => (
          <View
            key={sid}
            style={[
              styles.dayCellDot,
              { backgroundColor: theme.sport[sid as SportKey] ?? theme.color.accent },
            ]}
          />
        ))}
      </View>
      {selected ? (
        <View style={[styles.dayCellBar, { backgroundColor: theme.color.accent }]} />
      ) : null}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  DaySection — shared date header wrapper                                   */
/* -------------------------------------------------------------------------- */

function DaySection({
  date,
  tz,
  count,
  children,
}: {
  date: string;
  tz: string | undefined;
  count: number;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const isToday = date === ymdInTzLocal(new Date(), tz);
  return (
    <View style={styles.daySection}>
      <View style={styles.dayHeaderRow}>
        <View style={styles.dayHeaderLeft}>
          <View
            style={[
              styles.dayHeaderDot,
              { backgroundColor: isToday ? theme.color.accent : theme.color.textFaint },
            ]}
          />
          <Text style={[styles.dayHeaderTitle, { color: theme.color.text }]} numberOfLines={1}>
            {formatDayLabel(date, tz).toUpperCase()}
          </Text>
        </View>
        <View
          style={[
            styles.dayCountPill,
            {
              backgroundColor: theme.color.bgElevated,
              borderColor: isToday ? withAlpha(theme.color.accent, 0.4) : theme.color.border,
            },
          ]}
        >
          <Text
            style={[
              styles.dayCount,
              { color: isToday ? theme.color.accent : theme.color.textMuted },
            ]}
          >
            {isToday ? 'TODAY · ' : ''}
            {count} {count === 1 ? 'EVENT' : 'EVENTS'}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Filter chips                                                              */
/* -------------------------------------------------------------------------- */

function FilterChipRow({
  follows,
  sportFilter,
  onSelectSport,
}: {
  follows: FollowsResponse | undefined;
  sportFilter: string | null;
  onSelectSport: (id: string | null) => void;
}) {
  const theme = useTheme();
  const sports = follows?.sports ?? [];
  if (sports.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      <FilterChip
        label="All"
        active={sportFilter === null}
        onPress={() => onSelectSport(null)}
      />
      {sports.map((s) => {
        const accent = theme.sport[s.id as SportKey] ?? theme.color.accent;
        return (
          <FilterChip
            key={s.id}
            label={s.label}
            active={sportFilter === s.id}
            accent={accent}
            leading={
              <SportIcon
                name={SPORT_ICONS[s.id] ?? 'default'}
                size={12}
                color={sportFilter === s.id ? accent : theme.color.textMuted}
              />
            }
            onPress={() => onSelectSport(s.id)}
          />
        );
      })}
    </ScrollView>
  );
}

function SecondaryFilterRow({
  sport,
  compFilter,
  teamFilter,
  onSelectComp,
  onSelectTeam,
}: {
  sport: FollowsResponse['sports'][number];
  compFilter: string | null;
  teamFilter: string | null;
  onSelectComp: (id: string | null) => void;
  onSelectTeam: (id: string | null) => void;
}) {
  const theme = useTheme();
  const accent = theme.sport[sport.id as SportKey] ?? theme.color.accent;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.subChipRow}
    >
      <FilterChip
        label="All"
        active={compFilter === null && teamFilter === null}
        accent={accent}
        onPress={() => {
          onSelectComp(null);
          onSelectTeam(null);
        }}
      />
      {sport.competitions.map((c) => (
        <FilterChip
          key={`c:${c.id}`}
          label={c.label}
          active={compFilter === c.id}
          accent={accent}
          leading={
            c.logoUrl ? (
              <Image source={{ uri: c.logoUrl }} style={styles.chipLogo} />
            ) : null
          }
          onPress={() => onSelectComp(c.id)}
        />
      ))}
      {sport.teams.map((t) => (
        <FilterChip
          key={`t:${t.id}`}
          label={t.shortName ?? t.label}
          active={teamFilter === t.id}
          accent={accent}
          leading={
            t.logoUrl ? (
              <Image source={{ uri: t.logoUrl }} style={styles.chipLogo} />
            ) : null
          }
          onPress={() => onSelectTeam(t.id)}
        />
      ))}
    </ScrollView>
  );
}

function FilterChip({
  label,
  active,
  accent,
  leading,
  onPress,
}: {
  label: string;
  active: boolean;
  accent?: string;
  leading?: React.ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  const hue = accent ?? theme.color.accent;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View
        style={[
          styles.chip,
          {
            backgroundColor: active ? withAlpha(hue, 0.14) : theme.color.bgElevated,
            borderColor: active ? withAlpha(hue, 0.55) : theme.color.border,
          },
        ]}
      >
        {leading}
        <Text
          style={{
            color: active ? theme.color.text : theme.color.textMuted,
            fontSize: 13,
            fontWeight: '600',
            letterSpacing: 0.1,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function NavArrow({ direction, onPress }: { direction: 'prev' | 'next'; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? 'Previous month' : 'Next month'}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={[styles.navBtn, { borderColor: theme.color.border }]}
    >
      <Text
        allowFontScaling={false}
        style={{ color: theme.color.text, fontSize: 16, fontWeight: '700' }}
      >
        {direction === 'prev' ? '‹' : '›'}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Date helpers                                                              */
/* -------------------------------------------------------------------------- */

function startOfMonth(d: Date): Date {
  const c = new Date(d);
  c.setDate(1);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n);
  return startOfMonth(c);
}
function monthWindow(cursor: Date): { from: Date; to: Date } {
  const from = startOfMonth(cursor);
  const to = addMonths(cursor, 1);
  return { from, to };
}
function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function monthNameOf(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long' });
}
function formatDayLabel(ymd: string, tz: string | undefined): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const local = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const today = ymdInTzLocal(new Date(), tz);
  const tomorrow = ymdInTzLocal(new Date(Date.now() + 24 * 60 * 60 * 1000), tz);
  if (ymd === today) return 'Today';
  if (ymd === tomorrow) return 'Tomorrow';
  return local.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
function ymdInTzLocal(d: Date, tz: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(d);
}

function withAlpha(hex: string, a: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing[12] },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  titleTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[3],
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: fonts.display,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  monthLabelWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
    flexShrink: 1,
  },
  yearLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.data,
    fontVariant: ['tabular-nums'],
  },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    height: 32,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: spacing[1],
  },
  todayDot: { width: 7, height: 7, borderRadius: 4 },
  todayPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  dateStrip: {
    gap: spacing[2],
    paddingRight: spacing[5],
  },
  dayCell: {
    width: 54,
    height: 72,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
  },
  dayCellWeekday: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dayCellNum: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.display,
    fontVariant: ['tabular-nums'],
  },
  dayCellDots: { flexDirection: 'row', gap: 3, height: 5 },
  dayCellDot: { width: 5, height: 5, borderRadius: 3 },
  dayCellBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
  navBtn: {
    width: 36,
    height: 32,
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeCount: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  stickyWrap: {
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    gap: spacing[2],
  },
  chipRow: {
    paddingHorizontal: spacing[5],
    gap: spacing[2],
  },
  subChipRow: {
    paddingHorizontal: spacing[5],
    gap: spacing[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    borderWidth: 1,
    maxWidth: 220,
  },
  chipLogo: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  daySection: {
    // Rhythm per §37: heading, then a comfortable block of events,
    // then room to breathe before the next date.
    marginBottom: spacing[6],
  },
  cardStack: {
    gap: spacing[3],
    paddingHorizontal: spacing[5],
  },
  rowStack: {
    gap: spacing[2],
    paddingHorizontal: spacing[5],
  },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    marginBottom: spacing[3],
  },
  dayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    minWidth: 0,
  },
  dayHeaderDot: { width: 8, height: 8, borderRadius: 4 },
  dayHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontFamily: fonts.display,
    flexShrink: 1,
  },
  dayCountPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dayCount: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
});
