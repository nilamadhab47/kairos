import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  Layout,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EmptyState,
  ErrorState,
  NotificationRow,
  Screen,
  SectionHeader,
  Skeleton,
  useEventDetail,
  type NotificationItem,
  type TodayEvent,
} from '@/components';
import { haptics, motion, radii, spacing, useTheme } from '@/design';
import { api } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ListResponse = { notifications: NotificationItem[] };
type Filter = 'all' | 'unread';

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function AlertsScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { openEvent } = useEventDetail();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () =>
      api<ListResponse>(
        `/api/notifications?limit=100${filter === 'unread' ? '&unreadOnly=true' : ''}`,
      ),
    refetchOnWindowFocus: true,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const now = new Date().toISOString();
      qc.setQueriesData<ListResponse>({ queryKey: ['notifications'] }, (prev) => {
        if (!prev) return prev;
        return {
          notifications: prev.notifications.map((n) =>
            n.id === id ? { ...n, readAt: n.readAt ?? now, status: 'read' } : n,
          ),
        };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onRefresh = useCallback(async () => {
    haptics.select();
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['notifications'] });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const items = query.data?.notifications ?? [];
  const unreadCount = items.filter((n) => !n.readAt).length;
  const grouped = useMemo(() => groupByDay(items), [items]);

  const onMarkAll = useCallback(async () => {
    const unread = items.filter((n) => !n.readAt);
    if (unread.length === 0) return;
    haptics.success();
    await Promise.all(unread.map((n) => markRead.mutateAsync(n.id).catch(() => null)));
  }, [items, markRead]);

  const openFromNotification = useCallback(
    (n: NotificationItem) => {
      if (!n.event) return;
      const ev: TodayEvent = {
        id: n.event.id,
        category: n.event.category,
        title: n.event.title,
        subtitle: n.event.subtitle,
        startsAt: n.event.startsAt,
        status: n.event.status,
        metadata: null,
      };
      openEvent(ev);
    },
    [openEvent],
  );

  return (
    <Screen edges={['top']}>
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
        {/* Header ---------------------------------------------------------- */}
        <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={[styles.eyebrow, { color: theme.color.textFaint }]}>Inbox</Text>
            {unreadCount > 0 ? (
              <Animated.View
                entering={FadeInDown.duration(200)}
                style={[styles.unreadPill, { backgroundColor: theme.color.accent }]}
              >
                <Text style={{ color: theme.color.onAccent, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>
                  {unreadCount} NEW
                </Text>
              </Animated.View>
            ) : null}
          </View>
          <Text style={[styles.title, { color: theme.color.text }]}>Alerts</Text>
          <Text style={[styles.subtitle, { color: theme.color.textMuted }]}>
            {subtitleFor(query.status, items.length, unreadCount)}
          </Text>
        </Animated.View>

        {/* Segmented filter ------------------------------------------------ */}
        <View style={styles.filterBar}>
          <SegmentedFilter
            active={filter}
            onChange={(f) => {
              haptics.select();
              setFilter(f);
            }}
            unreadCount={unreadCount}
          />
          {unreadCount > 0 ? (
            <Pressable
              onPress={() => void onMarkAll()}
              accessibilityRole="button"
              style={styles.markAll}
              hitSlop={8}
            >
              <Text style={{ color: theme.color.accent, fontSize: 13, fontWeight: '600' }}>
                Mark all read
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Body ------------------------------------------------------------ */}
        {query.status === 'pending' ? (
          <View style={{ gap: spacing[3], paddingHorizontal: spacing[5], marginTop: spacing[4] }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </View>
        ) : query.status === 'error' ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? 'All caught up' : 'Nothing here yet'}
            description={
              filter === 'unread'
                ? 'Zero unread. Sit back — Kairos is watching.'
                : 'Alerts land here about 15 minutes before the events you follow.'
            }
          />
        ) : (
          <View style={{ marginTop: spacing[3] }}>
            {grouped.map((group, gi) => (
              <View key={group.key}>
                <SectionHeader
                  title={group.label}
                  trailing={
                    <Text style={[styles.groupCount, { color: theme.color.textFaint }]}>
                      {group.items.length}
                    </Text>
                  }
                />
                <View style={styles.list}>
                  {group.items.map((item, i) => (
                    <Animated.View
                      key={item.id}
                      entering={FadeInUp.delay(30 * i + gi * 20).duration(220)}
                      layout={Layout.springify()}
                    >
                      <NotificationRow
                        item={item}
                        onMarkRead={() => markRead.mutate(item.id)}
                        onPress={() => openFromNotification(item)}
                      />
                    </Animated.View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  Segmented filter                                                          */
/* -------------------------------------------------------------------------- */

function SegmentedFilter({
  active,
  onChange,
  unreadCount,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
  unreadCount: number;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.color.bgElevated, borderColor: theme.color.border }]}>
      <Segment label="All" active={active === 'all'} onPress={() => onChange('all')} />
      <Segment
        label="Unread"
        badge={unreadCount > 0 ? unreadCount : undefined}
        active={active === 'unread'}
        onPress={() => onChange('unread')}
      />
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
  badge,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
}) {
  const theme = useTheme();
  const highlight = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    highlight.value = withTiming(active ? 1 : 0, { duration: motion.duration.fast });
  }, [active, highlight]);

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      highlight.value,
      [0, 1],
      ['transparent', theme.color.surface],
    ),
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={styles.segmentBtnWrap}
    >
      <Animated.View style={[styles.segmentBtn, bgStyle]}>
        <Text
          style={{
            color: active ? theme.color.text : theme.color.textMuted,
            fontSize: 13,
            fontWeight: '600',
            letterSpacing: 0.1,
          }}
        >
          {label}
        </Text>
        {typeof badge === 'number' ? (
          <View
            style={[
              styles.segmentBadge,
              {
                backgroundColor: active ? theme.color.accent : theme.color.bg,
                borderColor: active ? theme.color.accent : theme.color.border,
              },
            ]}
          >
            <Text
              style={{
                color: active ? theme.color.onAccent : theme.color.textMuted,
                fontSize: 10,
                fontWeight: '800',
                letterSpacing: 0.2,
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                  */
/* -------------------------------------------------------------------------- */

function SkeletonRow() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing[3],
        padding: spacing[4],
        borderRadius: radii.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
      }}
    >
      <View style={{ gap: spacing[2], alignItems: 'center', width: 40 }}>
        <Skeleton width={10} height={10} radius={999} />
        <Skeleton width={30} height={30} radius={999} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="40%" height={10} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Grouping                                                                  */
/* -------------------------------------------------------------------------- */

type Group = { key: string; label: string; items: NotificationItem[] };

function groupByDay(items: NotificationItem[]): Group[] {
  const now = new Date();
  const todayKey = ymd(now);
  const yestKey = ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const byKey = new Map<string, Group>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = ymd(d);
    const label =
      key === todayKey
        ? 'Today'
        : key === yestKey
          ? 'Yesterday'
          : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (!byKey.has(key)) byKey.set(key, { key, label, items: [] });
    byKey.get(key)!.items.push(item);
  }
  return [...byKey.values()];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtitleFor(status: string, total: number, unread: number): string {
  if (status === 'pending') return 'Loading your inbox…';
  if (status === 'error') return 'Something went sideways.';
  if (total === 0) return "You're all clear.";
  if (unread === 0) return `${total} total  ·  nothing new.`;
  return `${unread} unread  ·  ${total} total.`;
}

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing[12] },
  header: { paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  unreadPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: spacing[1] },
  subtitle: { fontSize: 14, marginTop: spacing[1] },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    marginTop: spacing[5],
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  segmentBtnWrap: { minWidth: 76 },
  segmentBtn: {
    height: 32,
    paddingHorizontal: spacing[3],
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  markAll: { marginLeft: 'auto', paddingHorizontal: spacing[2], paddingVertical: 6 },
  groupCount: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  list: { gap: spacing[2], paddingHorizontal: spacing[5] },
});
