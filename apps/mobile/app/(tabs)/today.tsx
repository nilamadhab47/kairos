import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  EventCard,
  Screen,
  SectionHeader,
  SkeletonCard,
  useEventDetail,
  YourTeamsStrip,
} from '@/components';
import { haptics, spacing, useTheme } from '@/design';
import { api } from '@/lib/api';
import { matchToEvent, type FeedMatch } from '@/lib/feed';
import { greeting, useNow } from '@/lib/time';

/* -------------------------------------------------------------------------- */
/*  Backend types — mirrors GET /api/me/today                                 */
/* -------------------------------------------------------------------------- */

type TodayGroup = {
  sportId: string;
  sportLabel: string;
  matches: FeedMatch[];
};

type TodayResponse = {
  timezone: string;
  date: string;
  subscriptionCount: number;
  nextUp: FeedMatch[];
  live: FeedMatch[];
  groups: TodayGroup[];
  /** Populated by the backend only when there's nothing on today. */
  upcoming: FeedMatch[];
  empty: { kind: 'no_subscriptions' | 'no_events_today'; message: string } | null;
  source: string;
};

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export default function TodayScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { openEvent } = useEventDetail();
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow(60_000);

  const query = useQuery({
    queryKey: ['me', 'today'],
    queryFn: () => api<TodayResponse>('/api/me/today'),
    refetchOnWindowFocus: true,
  });

  const onRefresh = useCallback(async () => {
    haptics.select();
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['me', 'today'] });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const data = query.data;
  const tz = data?.timezone;
  const dateLabel = useMemo(() => formatDateLabel(data?.date, tz), [data?.date, tz]);
  const totalToday = useMemo(
    () => (data?.groups.reduce((sum, g) => sum + g.matches.length, 0) ?? 0) + (data?.live.length ?? 0),
    [data],
  );
  const todayTeamIds = useMemo(() => {
    const ids = new Set<string>();
    if (!data) return ids;
    const collect = (list: FeedMatch[]) => {
      for (const m of list) {
        if (m.homeTeam?.id) ids.add(m.homeTeam.id);
        if (m.awayTeam?.id) ids.add(m.awayTeam.id);
      }
    };
    collect(data.live);
    collect(data.nextUp);
    for (const g of data.groups) collect(g.matches);
    return ids;
  }, [data]);

  return (
    <Screen edges={['top']}>
      <AnimatedScrollView
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
        <Animated.View entering={FadeInDown.duration(280)} style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.color.textFaint }]}>
            {greeting(now, tz)}
          </Text>
          <Text style={[styles.title, { color: theme.color.text }]}>Today</Text>
          <Text style={[styles.subtitle, { color: theme.color.textMuted }]}>
            {subtitleFor(query.status, totalToday, dateLabel)}
          </Text>
        </Animated.View>

        {query.status !== 'error' ? <YourTeamsStrip todayTeamIds={todayTeamIds} /> : null}

        {query.status === 'pending' ? (
          <View style={{ gap: spacing[3], paddingHorizontal: spacing[5], marginTop: spacing[6] }}>
            <SkeletonCard height={180} />
            <SkeletonCard height={132} />
            <SkeletonCard height={132} />
          </View>
        ) : query.status === 'error' ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : data?.empty?.kind === 'no_subscriptions' ? (
          <EmptyState
            title="Follow something to get started"
            description={data.empty.message}
            actionLabel="Pick your sports"
            onAction={() => router.push('/(onboarding)/sports')}
          />
        ) : data?.empty?.kind === 'no_events_today' && data.upcoming.length === 0 ? (
          <EmptyState
            title="Nothing on today"
            description={data.empty.message}
            actionLabel="Adjust preferences"
            onAction={() => router.push('/(tabs)/settings')}
          />
        ) : data?.empty?.kind === 'no_events_today' && data.upcoming.length > 0 ? (
          <>
            <View style={{ paddingHorizontal: spacing[5], marginTop: spacing[4] }}>
              <Text style={[styles.emptyLead, { color: theme.color.textMuted }]}>
                {data.empty.message}
              </Text>
            </View>
            <View>
              <SectionHeader
                title="Coming up"
                trailing={
                  <Text style={[styles.groupCount, { color: theme.color.textFaint }]}>
                    {data.upcoming.length}
                  </Text>
                }
              />
              <View style={styles.list}>
                {data.upcoming.map((m, i) => (
                  <Animated.View
                    key={m.id}
                    entering={FadeInUp.delay(50 * i).duration(260)}
                  >
                    <EventCard
                      event={matchToEvent(m)}
                      variant={i === 0 ? 'hero' : 'default'}
                      timezone={tz}
                      onPress={() => openEvent(matchToEvent(m), tz)}
                    />
                  </Animated.View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {data && data.nextUp.length > 0 ? (
              <View>
                <SectionHeader title="Next up" />
                <View style={styles.list}>
                  {data.nextUp.map((m, i) => (
                    <Animated.View
                      key={m.id}
                      entering={FadeInUp.delay(60 * i).duration(280)}
                    >
                      <EventCard
                        event={matchToEvent(m)}
                        variant={i === 0 ? 'hero' : 'default'}
                        timezone={tz}
                        onPress={() => openEvent(matchToEvent(m), tz)}
                      />
                    </Animated.View>
                  ))}
                </View>
              </View>
            ) : null}

            {data && data.live.length > 0 ? (
              <View>
                <SectionHeader
                  title="Live now"
                  trailing={
                    <View style={styles.livePulse}>
                      <View style={[styles.liveDot, { backgroundColor: theme.color.live }]} />
                      <Text style={[styles.liveCount, { color: theme.color.live }]}>
                        {data.live.length}
                      </Text>
                    </View>
                  }
                />
                <View style={styles.list}>
                  {data.live.map((m, i) => (
                    <Animated.View
                      key={m.id}
                      entering={FadeInUp.delay(50 * i).duration(260)}
                    >
                      <EventCard
                        event={matchToEvent(m)}
                        variant="hero"
                        timezone={tz}
                        onPress={() => openEvent(matchToEvent(m), tz)}
                      />
                    </Animated.View>
                  ))}
                </View>
              </View>
            ) : null}

            {data
              ? data.groups.map((group, gi) => {
                  const nextUpIds = new Set(data.nextUp.map((m) => m.id));
                  const liveIds = new Set(data.live.map((m) => m.id));
                  const rest = group.matches.filter(
                    (m) => !nextUpIds.has(m.id) && !liveIds.has(m.id),
                  );
                  if (rest.length === 0) return null;
                  return (
                    <View key={group.sportId}>
                      <SectionHeader
                        title={group.sportLabel}
                        trailing={
                          <Text style={[styles.groupCount, { color: theme.color.textFaint }]}>
                            {rest.length}
                          </Text>
                        }
                      />
                      <View style={styles.list}>
                        {rest.map((m, i) => (
                          <Animated.View
                            key={m.id}
                            entering={FadeInUp.delay(40 * i + gi * 30).duration(240)}
                          >
                            <EventCard
                              event={matchToEvent(m)}
                              timezone={tz}
                              onPress={() => openEvent(matchToEvent(m), tz)}
                            />
                          </Animated.View>
                        ))}
                      </View>
                    </View>
                  );
                })
              : null}
          </>
        )}
      </AnimatedScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function subtitleFor(status: string, count: number, dateLabel: string): string {
  if (status === 'pending') return 'Gathering your day…';
  if (status === 'error') return 'Something went sideways.';
  if (count === 0) return dateLabel;
  const noun = count === 1 ? 'event' : 'events';
  return `${dateLabel}  ·  ${count} ${noun}`;
}

function formatDateLabel(iso: string | undefined, tz: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    });
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing[12] },
  header: { paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: spacing[1] },
  subtitle: { fontSize: 14, marginTop: spacing[1] },
  list: { gap: spacing[3], paddingHorizontal: spacing[5] },
  emptyLead: { fontSize: 14, lineHeight: 20 },
  livePulse: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 999 },
  liveCount: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  groupCount: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
});
