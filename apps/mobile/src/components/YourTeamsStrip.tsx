import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { haptics, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import { teamAbbreviation } from '@/lib/team';
import { Button } from './Button';
import { TeamCrest } from './TeamCrest';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type FollowTeam = {
  id: string;
  label: string;
  shortName: string | null;
  logoUrl: string | null;
};

type FollowSport = {
  id: string;
  label: string;
  followedWhole: boolean;
  teams: FollowTeam[];
};

type FollowsResponse = {
  totalFollows: number;
  sports: FollowSport[];
};

type EnrichedTeam = FollowTeam & {
  sportId: string;
  sportLabel: string;
  abbreviation: string;
};

/* -------------------------------------------------------------------------- */
/*  Layout constants                                                          */
/* -------------------------------------------------------------------------- */

const TILE_WIDTH = 72; // fixed per §9 — abbreviation never determines the width
const CREST_SIZE = 56; // ~48pt logo inside a 56pt container per §3

/* -------------------------------------------------------------------------- */
/*  Public component                                                          */
/* -------------------------------------------------------------------------- */

type Props = {
  /**
   * IDs of teams the user follows that have an event scheduled today.
   * When present, that tile gets a small teal dot indicator (§22).
   */
  todayTeamIds?: Set<string>;
};

export function YourTeamsStrip({ todayTeamIds }: Props = {}) {
  const theme = useTheme();
  const { data, isPending } = useQuery({
    queryKey: ['me', 'follows'],
    queryFn: () => api<FollowsResponse>('/api/me/follows'),
    staleTime: 60_000,
  });

  const teams: EnrichedTeam[] = useMemo(() => {
    if (!data) return [];
    // Priority: follow order per-sport, sports in the sport-catalog order
    // that `/api/me/follows` already sorts by.
    return data.sports.flatMap((s) =>
      s.teams.map((t) => ({
        ...t,
        sportId: s.id,
        sportLabel: s.label,
        abbreviation: teamAbbreviation(t.label, t.shortName),
      })),
    );
  }, [data]);

  // While loading we don't render anything — the strip is decorative on
  // top of a screen that already has its own skeleton state.
  if (isPending) return null;

  if (teams.length === 0) {
    return (
      <View style={styles.wrap}>
        <SectionHead label="Your teams" />
        <View style={styles.emptyWrap}>
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: theme.color.surface, borderColor: theme.color.border },
            ]}
          >
            <Text style={[styles.emptyText, { color: theme.color.textMuted }]}>
              Follow teams to see them here.
            </Text>
            <View style={{ marginTop: spacing[3] }}>
              <Button
                label="Choose teams"
                size="md"
                variant="secondary"
                onPress={() => router.push('/(onboarding)/teams')}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(260)} style={styles.wrap}>
      <SectionHead label="Your teams" count={teams.length} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.railContent}
      >
        {teams.map((t, i) => (
          <Animated.View key={t.id} entering={FadeInRight.delay(30 * i).duration(240)}>
            <TeamTile team={t} hasToday={todayTeamIds?.has(t.id) ?? false} />
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section head                                                              */
/* -------------------------------------------------------------------------- */

function SectionHead({ label, count }: { label: string; count?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.eyebrow, { color: theme.color.textFaint }]}>
        {label.toUpperCase()}
      </Text>
      {typeof count === 'number' ? (
        <Text style={[styles.count, { color: theme.color.textFaint }]}>{count}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Team tile                                                                 */
/* -------------------------------------------------------------------------- */

function TeamTile({ team, hasToday }: { team: EnrichedTeam; hasToday: boolean }) {
  const theme = useTheme();
  const accent = theme.sport[team.sportId as SportKey] ?? theme.color.accent;
  const scale = useSharedValue(1);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={team.label}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 220 });
      }}
      onPress={() => {
        haptics.light();
        router.push({
          pathname: '/team/[id]',
          params: { id: team.id, name: team.label, sport: team.sportId },
        });
      }}
      style={styles.tilePress}
      hitSlop={4}
    >
      <Animated.View style={[styles.tile, containerStyle]}>
        <View style={styles.crestSlot}>
          <View
            style={[
              styles.crestRing,
              {
                borderColor: withAlpha(accent, 0.35),
                backgroundColor: theme.color.surface,
              },
            ]}
          >
            <TeamCrest
              name={team.label}
              logoUrl={team.logoUrl}
              size={CREST_SIZE - 6}
              accentColor={null}
            />
          </View>
          {hasToday ? (
            <View
              style={[
                styles.todayDot,
                { backgroundColor: theme.color.accent, borderColor: theme.color.bg },
              ]}
            />
          ) : null}
        </View>
        <Text
          style={[styles.abbrev, { color: theme.color.textMuted }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {team.abbreviation}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

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
  wrap: { marginTop: spacing[5] },
  header: {
    paddingHorizontal: spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  count: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
    opacity: 0.7,
  },

  // Rail
  railContent: {
    paddingLeft: spacing[5],
    // Trailing space so the last tile can sit slightly inset from the edge,
    // and the next-tile continuation affordance from §8 reads naturally.
    paddingRight: spacing[5] + TILE_WIDTH / 3,
    gap: 4,
  },

  // Tile — fixed width, prevents any name from destroying the layout (§9)
  tilePress: { width: TILE_WIDTH, alignItems: 'center' },
  tile: { alignItems: 'center', gap: spacing[2] },
  crestSlot: {
    width: CREST_SIZE,
    height: CREST_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestRing: {
    width: CREST_SIZE,
    height: CREST_SIZE,
    borderRadius: CREST_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  todayDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  abbrev: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
    width: TILE_WIDTH,
    height: 14,
    lineHeight: 14,
  },

  // Empty state
  emptyWrap: { paddingHorizontal: spacing[5] },
  emptyCard: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[4],
    alignItems: 'flex-start',
  },
  emptyText: { fontSize: 13, lineHeight: 18 },
});
