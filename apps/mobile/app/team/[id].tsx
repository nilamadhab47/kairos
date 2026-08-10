import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarEventRow,
  EmptyState,
  ErrorState,
  Screen,
  SettingsIcon,
  SkeletonCard,
  TeamCrest,
  useEventDetail,
} from '@/components';
import { haptics, radii, spacing, useTheme, type SportKey } from '@/design';
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

/* -------------------------------------------------------------------------- */

export default function TeamScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string; name?: string; sport?: string }>();
  const { openEvent } = useEventDetail();
  const [refreshing, setRefreshing] = useState(false);

  const teamId = params.id;

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

  // Next 60 days of matches for this team.
  const rangeFrom = useMemo(() => new Date().toISOString(), []);
  const rangeTo = useMemo(
    () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );

  const cal = useQuery({
    queryKey: ['team', teamId, 'upcoming'],
    queryFn: () =>
      api<CalendarResponse>(
        `/api/me/calendar?entity=${encodeURIComponent(teamId)}&from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
      ),
    enabled: Boolean(teamId),
  });

  const onRefresh = useCallback(async () => {
    haptics.select();
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['team', teamId, 'upcoming'] });
    } finally {
      setRefreshing(false);
    }
  }, [qc, teamId]);

  const accent = team
    ? (theme.sport[team.sportId as SportKey] ?? theme.color.accent)
    : theme.color.accent;

  const displayName = team?.label ?? params.name ?? 'Team';
  const totalMatches = cal.data?.totalMatches ?? 0;
  const days = cal.data?.days ?? [];

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
          <View style={[styles.crestWrap, { borderColor: withAlpha(accent, 0.5) }]}>
            <TeamCrest name={displayName} logoUrl={team?.logoUrl ?? null} size={72} accentColor={accent} />
          </View>
          <Text style={[styles.title, { color: theme.color.text }]} numberOfLines={2}>
            {displayName}
          </Text>
          <Text style={[styles.eyebrow, { color: accent }]}>
            {(team?.sportLabel ?? params.sport ?? '').toUpperCase()}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.pill, { borderColor: theme.color.border }]}>
              <Text style={[styles.pillText, { color: theme.color.textMuted }]}>
                {totalMatches === 0
                  ? 'No upcoming matches'
                  : totalMatches === 1
                    ? '1 upcoming match'
                    : `${totalMatches} upcoming matches`}
              </Text>
            </View>
          </View>
        </Animated.View>

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
            title="Nothing scheduled"
            description={
              cal.data?.empty?.message ??
              `${displayName} has no upcoming fixtures in the next 60 days.`
            }
          />
        ) : (
          <View style={styles.list}>
            {days.map((day, di) => (
              <Animated.View
                key={day.date}
                entering={FadeInUp.delay(40 * di).duration(240)}
                layout={Layout.springify()}
                style={styles.daySection}
              >
                <DayHeader date={day.date} tz={cal.data?.timezone} />
                <View style={{ gap: spacing[2] }}>
                  {day.matches.map((m) => (
                    <CalendarEventRow
                      key={m.id}
                      match={m}
                      timezone={cal.data?.timezone}
                      onPress={() => openEvent(matchToEvent(m), cal.data?.timezone)}
                    />
                  ))}
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

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
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  metaRow: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: { fontSize: 12, fontWeight: '600' },

  list: { paddingHorizontal: spacing[5], marginTop: spacing[3], gap: spacing[6] },
  daySection: { gap: spacing[3] },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  dayLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  dayMeta: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
});
