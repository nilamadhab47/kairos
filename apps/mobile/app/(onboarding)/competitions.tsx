import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  ErrorState,
  PickerRow,
} from '@/components';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import {
  compsBySportFromSummary,
  type FollowsSummary,
  isManageMode,
  manageParams,
  OnboardingTopBar,
  pinSelectedFirst,
  SearchInput,
  SPORT_LABELS,
  SportPillBar,
} from '@/lib/onboarding-shared';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Competition = {
  id: string;
  name: string;
  displayName: string;
  shortName: string | null;
  country: string | null;
  logoUrl: string | null;
  season: string | null;
  seasonLabel: string | null;
  format: string | null;
  gender: string | null;
  tier: number;
};

type CompetitionsResponse = { competitions: Competition[]; count: number };

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function CompetitionsOnboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { sports: sportsParam, mode } = useLocalSearchParams<{
    sports?: string;
    mode?: string;
  }>();
  const manage = isManageMode(mode);
  const sportIds = useMemo(
    () => (sportsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [sportsParam],
  );

  const [activeSport, setActiveSport] = useState(sportIds[0] ?? 'football');
  const [query_, setQueryText] = useState('');
  // sportId → Set of competitionIds
  const [picks, setPicks] = useState<Record<string, Set<string>>>({});
  const hydrated = useRef(false);
  const accent = theme.sport[activeSport as SportKey] ?? theme.color.accent;

  const summary = useQuery({
    queryKey: ['subscriptions', 'summary'],
    queryFn: () => api<FollowsSummary>('/api/subscriptions/summary'),
    enabled: manage,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!manage || !summary.data || hydrated.current) return;
    // Only hydrate picks for sports in this edit session.
    const fromSummary = compsBySportFromSummary(summary.data);
    const next: Record<string, Set<string>> = {};
    for (const sid of sportIds) {
      next[sid] = fromSummary[sid] ?? new Set();
    }
    setPicks(next);
    hydrated.current = true;
  }, [manage, summary.data, sportIds]);

  // Keep activeSport valid if sports param changes.
  useEffect(() => {
    if (sportIds.length && !sportIds.includes(activeSport)) {
      setActiveSport(sportIds[0]!);
    }
  }, [sportIds, activeSport]);

  const query = useQuery({
    queryKey: ['catalog', 'competitions', activeSport],
    queryFn: () =>
      api<CompetitionsResponse>(
        `/api/catalog/competitions?category=${encodeURIComponent(activeSport)}&limit=60&dedupeBySeason=true`,
      ),
    enabled: Boolean(activeSport),
    staleTime: 60_000,
  });

  const toggle = useCallback((sportId: string, compId: string) => {
    setPicks((prev) => {
      const next = { ...prev };
      const bucket = new Set(next[sportId] ?? []);
      if (bucket.has(compId)) bucket.delete(compId);
      else bucket.add(compId);
      next[sportId] = bucket;
      return next;
    });
  }, []);

  const totalPicks = useMemo(
    () => Object.values(picks).reduce((sum, s) => sum + s.size, 0),
    [picks],
  );

  const onContinue = useCallback(() => {
    haptics.success();
    const encoded = sportIds
      .map((sid) => {
        const bucket = [...(picks[sid] ?? [])];
        return `${sid}:${bucket.join('|')}`;
      })
      .join(',');
    router.push({
      pathname: '/(onboarding)/teams',
      params: {
        sports: sportIds.join(','),
        comps: encoded,
        ...manageParams(mode),
      },
    });
  }, [picks, sportIds, mode]);

  const onSkip = useCallback(() => {
    router.push({
      pathname: '/(onboarding)/teams',
      params: {
        sports: sportIds.join(','),
        comps: sportIds.map((s) => `${s}:`).join(','),
        ...manageParams(mode),
      },
    });
  }, [sportIds, mode]);

  const activePicks = picks[activeSport] ?? new Set<string>();

  // Merge saved follows that might be missing from the catalog page, then pin.
  const extrasForActive = useMemo(() => {
    if (!manage || !summary.data) return [] as Competition[];
    const sport = summary.data.sports.find((s) => s.sportId === activeSport);
    if (!sport) return [];
    return sport.competitions.map((c) => ({
      id: c.id,
      name: c.name ?? c.displayName ?? c.id,
      displayName: c.displayName ?? c.name ?? c.id,
      shortName: null,
      country: null,
      logoUrl: c.logoUrl,
      season: null,
      seasonLabel: null,
      format: null,
      gender: null,
      tier: 0,
    }));
  }, [manage, summary.data, activeSport]);

  const allComps = query.data?.competitions ?? [];
  const comps = useMemo(() => {
    const q = query_.trim().toLowerCase();
    const pinned = pinSelectedFirst(allComps, activePicks, extrasForActive);
    if (!q) return pinned;
    return pinned.filter((c) => {
      const hay =
        `${c.displayName} ${c.name} ${c.shortName ?? ''} ${c.country ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allComps, query_, activePicks, extrasForActive]);

  const loading =
    query.isLoading || (manage && summary.isLoading && !hydrated.current);

  return (
    <View style={[styles.root, { backgroundColor: theme.color.bg }]}>
      <OnboardingTopBar showBack paddingTop={insets.top + spacing[3]} />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: spacing[16] + 72,
          paddingHorizontal: spacing[5],
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.duration(reduce ? 0 : 340)}
          style={styles.headlineBlock}
        >
          {manage ? (
            <>
              <Text style={[styles.h1, { color: theme.color.text }]}>YOUR</Text>
              <Text style={[styles.h1, { color: theme.color.text }]}>LEAGUES</Text>
              <Text style={[styles.h1, { color: accent }]}>& CUPS</Text>
            </>
          ) : (
            <>
              <Text style={[styles.h1, { color: theme.color.text }]}>WHICH</Text>
              <Text style={[styles.h1, { color: theme.color.text }]}>LEAGUES</Text>
              <Text style={[styles.h1, { color: accent }]}>DO YOU LIVE FOR?</Text>
            </>
          )}
        </Animated.View>
        <Animated.Text
          entering={FadeInDown.delay(reduce ? 0 : 120).duration(reduce ? 0 : 300)}
          style={[styles.sub, { color: theme.color.textMuted }]}
        >
          {manage
            ? 'Saved competitions sit at the top. Toggle any to update.'
            : 'Pick the competitions that matter. Skip a sport to follow it whole.'}
        </Animated.Text>

        {sportIds.length > 1 ? (
          <View style={{ marginTop: spacing[6], marginHorizontal: -spacing[5] }}>
            <SportPillBar
              sports={sportIds}
              active={activeSport}
              onChange={(id) => {
                haptics.select();
                setActiveSport(id);
                setQueryText('');
              }}
              badgeCount={(id) => picks[id]?.size ?? 0}
            />
          </View>
        ) : null}

        <View style={{ marginTop: spacing[5] }}>
          <SearchInput
            value={query_}
            onChangeText={setQueryText}
            placeholder={`Search ${SPORT_LABELS[activeSport] ?? activeSport} leagues…`}
          />
        </View>

        <View style={styles.list}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={accent} />
              <Text style={[styles.loadingLabel, { color: theme.color.textMuted }]}>
                Loading {SPORT_LABELS[activeSport] ?? activeSport} competitions…
              </Text>
            </View>
          ) : query.isError ? (
            <View style={{ paddingVertical: spacing[8] }}>
              <ErrorState
                title="Couldn't load competitions"
                description="Check your connection and try again."
                onRetry={() => void query.refetch()}
              />
            </View>
          ) : comps.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: theme.color.text }]}>
                {query_ ? 'No matches' : 'Nothing to show yet'}
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.color.textMuted }]}>
                {query_
                  ? `No ${SPORT_LABELS[activeSport] ?? activeSport} competitions match “${query_}”.`
                  : `We haven't ingested any ${SPORT_LABELS[activeSport] ?? activeSport} competitions. You can skip and still follow the whole sport.`}
              </Text>
            </View>
          ) : (
            comps.map((c, i) => (
              <Animated.View
                key={c.id}
                entering={
                  reduce ? undefined : FadeInDown.delay(80 + i * 20).duration(240)
                }
              >
                <PickerRow
                  label={c.displayName}
                  sublabel={formatCompSub(c)}
                  logoUrl={c.logoUrl}
                  accentColor={accent}
                  selected={activePicks.has(c.id)}
                  onToggle={() => toggle(activeSport, c.id)}
                />
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.color.bg,
            borderTopColor: theme.color.border,
            paddingBottom: Math.max(insets.bottom + spacing[3], spacing[6]),
          },
        ]}
      >
        <Text style={[styles.helper, { color: theme.color.textMuted }]}>
          {totalPicks === 0
            ? "Skip any sport to follow all of it — you'll never miss a match."
            : totalPicks === 1
              ? '1 competition selected · nice.'
              : `${totalPicks} competitions selected.`}
        </Text>
        <View style={styles.ctaRow}>
          <SkipButton onPress={onSkip} />
          <ContinueButton onPress={onContinue} />
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCompSub(c: Competition): string | null {
  const bits = [
    c.format ? formatLabel(c.format) : null,
    c.gender && c.gender !== 'men' ? capitalize(c.gender) : null,
    c.country,
    c.seasonLabel,
  ].filter(Boolean);
  return bits.length ? bits.join('  ·  ') : null;
}

function formatLabel(f: string): string {
  const map: Record<string, string> = {
    league: 'League',
    cup: 'Cup',
    'super-cup': 'Super Cup',
    friendly: 'Friendly',
    franchise: 'Franchise',
    international: 'International',
    test: 'Test',
    odi: 'ODI',
    t20: 'T20',
    t20i: 'T20I',
    'first-class': 'First-class',
    'list-a': 'List A',
    championship: 'Championship',
    'grand-slam': 'Grand Slam',
    'atp-1000': 'ATP 1000',
    'atp-500': 'ATP 500',
    wta: 'WTA',
  };
  return map[f] ?? capitalize(f);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* -------------------------------------------------------------------------- */
/*  Footer buttons                                                            */
/* -------------------------------------------------------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ContinueButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => (scale.value = withSpring(0.97, motion.spring.press))}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={[styles.cta, { backgroundColor: theme.color.accent, flex: 1 }, anim]}
    >
      <Text style={{ color: theme.color.onAccent, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 }}>
        Continue
      </Text>
    </AnimatedPressable>
  );
}

function SkipButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => (scale.value = withSpring(0.98, motion.spring.press))}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={onPress}
      style={[styles.skip, { borderColor: theme.color.border }, anim]}
    >
      <Text style={{ color: theme.color.textMuted, fontSize: 15, fontWeight: '600' }}>
        Skip
      </Text>
    </AnimatedPressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1 },
  headlineBlock: { marginTop: spacing[4], gap: -4 },
  h1: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  sub: {
    marginTop: spacing[3],
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 340,
  },
  list: { marginTop: spacing[5], gap: spacing[3] },
  loading: { paddingVertical: spacing[10], alignItems: 'center', gap: spacing[3] },
  loadingLabel: { fontSize: 13 },
  emptyWrap: { paddingVertical: spacing[8], alignItems: 'center', gap: spacing[2] },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyDesc: { fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    gap: spacing[3],
  },
  helper: { fontSize: 12, letterSpacing: 0.2 },
  ctaRow: { flexDirection: 'row', gap: spacing[3] },
  cta: {
    height: 52,
    borderRadius: radii.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skip: {
    height: 52,
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    minWidth: 96,
  },
});
