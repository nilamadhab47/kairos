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
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ErrorState,
  PickerRow,
  SectionHeader,
} from '@/components';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import {
  decodeSelections,
  encodeSelections,
  type FollowsSummary,
  isManageMode,
  manageParams,
  OnboardingTopBar,
  pinSelectedFirst,
  SearchInput,
  SPORT_LABELS,
  SPORT_ONBOARDING,
  SportPillBar,
  sportTeamType,
  teamsBySportFromSummary,
} from '@/lib/onboarding-shared';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Team = {
  id: string;
  name: string;
  shortName: string | null;
  type: string | null;
  country: string | null;
  logoUrl: string | null;
};

type TeamsResponse = { teams: Team[]; count: number };

type CompetitionLite = {
  id: string;
  displayName: string;
  logoUrl: string | null;
};
type CompetitionsResponse = { competitions: CompetitionLite[] };

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function TeamsOnboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { sports: sportsParam, comps: compsParam, mode } = useLocalSearchParams<{
    sports?: string;
    comps?: string;
    mode?: string;
  }>();
  const manage = isManageMode(mode);

  const sportIds = useMemo(
    () => (sportsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [sportsParam],
  );
  const compsBySport = useMemo(() => decodeSelections(compsParam), [compsParam]);

  const [activeSport, setActiveSport] = useState(sportIds[0] ?? 'football');
  const [query_, setQueryText] = useState('');
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
    const fromSummary = teamsBySportFromSummary(summary.data);
    const next: Record<string, Set<string>> = {};
    for (const sid of sportIds) {
      next[sid] = fromSummary[sid] ?? new Set();
    }
    setPicks(next);
    hydrated.current = true;
  }, [manage, summary.data, sportIds]);

  useEffect(() => {
    if (sportIds.length && !sportIds.includes(activeSport)) {
      setActiveSport(sportIds[0]!);
    }
  }, [sportIds, activeSport]);

  // Fetch teams per sport. If comps chosen for that sport, one query per comp
  // (so lists stay focused). Otherwise use the sport's preferred team type
  // (cricket → national sides, F1 → constructors).
  const compsForActive = useMemo(
    () => [...(compsBySport[activeSport] ?? [])],
    [compsBySport, activeSport],
  );
  const preferredType = sportTeamType(activeSport);

  const teamQueries = useQueries({
    queries: compsForActive.length
      ? compsForActive.map((competitionId) => ({
          queryKey: ['catalog', 'teams', activeSport, competitionId] as const,
          queryFn: () =>
            api<TeamsResponse>(
              `/api/catalog/teams?category=${encodeURIComponent(activeSport)}&competitionId=${encodeURIComponent(
                competitionId,
              )}&limit=200`,
            ),
          staleTime: 60_000,
        }))
      : [
          {
            queryKey: ['catalog', 'teams', activeSport, preferredType ?? 'broad'] as const,
            queryFn: () => {
              const params = new URLSearchParams({
                category: activeSport,
                limit: '120',
                hasLogo: 'true',
              });
              if (preferredType) params.set('type', preferredType);
              return api<TeamsResponse>(`/api/catalog/teams?${params}`);
            },
            staleTime: 60_000,
          },
        ],
  });

  // Metadata for section headers. Reuses the same cache key the
  // competitions screen wrote — usually a cache hit and instant.
  const compsMetaQuery = useQuery({
    queryKey: ['catalog', 'competitions', activeSport],
    queryFn: () =>
      api<CompetitionsResponse>(
        `/api/catalog/competitions?category=${encodeURIComponent(activeSport)}&limit=200&dedupeBySeason=true`,
      ),
    staleTime: 60_000,
    enabled: compsForActive.length > 0,
  });

  const compsMetaById = useMemo(() => {
    const m = new Map<string, CompetitionLite>();
    for (const c of compsMetaQuery.data?.competitions ?? []) m.set(c.id, c);
    return m;
  }, [compsMetaQuery.data]);

  /**
   * When the user picked competitions, group teams under each comp's
   * SectionHeader so it's obvious that Arsenal lives in the EPL and
   * Barça lives in La Liga. Teams appearing in multiple comps are
   * deduped — they show only in the first section they appear in.
   *
   * When no comps are picked, fall back to a single ungrouped list.
   */
  type Section = { key: string; title: string; logoUrl: string | null; teams: Team[] };

  const sections = useMemo<Section[]>(() => {
    if (compsForActive.length === 0) {
      const flat: Team[] = [];
      const seen = new Set<string>();
      for (const q of teamQueries) {
        for (const t of q.data?.teams ?? []) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            flat.push(t);
          }
        }
      }
      return flat.length ? [{ key: '__all__', title: '', logoUrl: null, teams: flat }] : [];
    }

    // Deduplicate teams across competition sections — a team shows only
    // in the first section it belongs to (typically the domestic league).
    const seen = new Set<string>();
    return compsForActive.map((compId, idx) => {
      const meta = compsMetaById.get(compId);
      const q = teamQueries[idx];
      const uniqueTeams = (q?.data?.teams ?? []).filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      return {
        key: compId,
        title: meta?.displayName ?? 'Teams',
        logoUrl: meta?.logoUrl ?? null,
        teams: uniqueTeams,
      };
    });
  }, [compsForActive, teamQueries, compsMetaById]);

  const filteredSections = useMemo<Section[]>(() => {
    const activePicks = picks[activeSport] ?? new Set<string>();
    const extras: Team[] = [];
    if (manage && summary.data) {
      const sport = summary.data.sports.find((s) => s.sportId === activeSport);
      for (const t of sport?.teams ?? []) {
        extras.push({
          id: t.id,
          name: t.name ?? t.displayName ?? t.id,
          shortName: null,
          type: null,
          country: null,
          logoUrl: t.logoUrl,
        });
      }
    }

    const matchesQuery = (t: Team) => {
      const q = query_.trim().toLowerCase();
      if (!q) return true;
      const hay = `${t.name} ${t.shortName ?? ''} ${t.country ?? ''}`.toLowerCase();
      return hay.includes(q);
    };

    const mapped = sections
      .map((s) => {
        const source =
          s.key === '__all__'
            ? pinSelectedFirst(s.teams, activePicks, extras)
            : pinSelectedFirst(s.teams, activePicks);
        return { ...s, teams: source.filter(matchesQuery) };
      })
      .filter((s) => s.teams.length > 0);

    // Keep followed teams visible even if the catalog page omitted them.
    if (sections[0]?.key !== '__all__') {
      const seen = new Set(mapped.flatMap((s) => s.teams.map((t) => t.id)));
      const orphans = extras.filter((t) => activePicks.has(t.id) && !seen.has(t.id)).filter(matchesQuery);
      if (orphans.length > 0) {
        return [
          { key: '__following__', title: 'Following', logoUrl: null, teams: orphans },
          ...mapped,
        ];
      }
    }
    return mapped;
  }, [sections, query_, picks, activeSport, manage, summary.data]);

  const totalVisible = filteredSections.reduce((n, s) => n + s.teams.length, 0);
  const anyLoading =
    teamQueries.some((q) => q.isLoading) ||
    (manage && summary.isLoading && !hydrated.current);
  const anyError = teamQueries.every((q) => q.isError) && teamQueries.length > 0;

  const toggle = useCallback((sportId: string, teamId: string) => {
    setPicks((prev) => {
      const next = { ...prev };
      const bucket = new Set(next[sportId] ?? []);
      if (bucket.has(teamId)) bucket.delete(teamId);
      else bucket.add(teamId);
      next[sportId] = bucket;
      return next;
    });
  }, []);

  const totalPicks = useMemo(
    () => Object.values(picks).reduce((sum, s) => sum + s.size, 0),
    [picks],
  );

  const goReview = useCallback(() => {
    haptics.success();
    router.push({
      pathname: '/(onboarding)/review',
      params: {
        sports: sportIds.join(','),
        comps: compsParam ?? '',
        teams: encodeSelections(picks),
        ...manageParams(mode),
      },
    });
  }, [picks, sportIds, compsParam, mode]);

  const goSkip = useCallback(() => {
    // Empty teams for a sport → review writes a whole-sport follow when that
    // sport also has no competitions (cricket/F1 path). Perfect for "just
    // give me Formula 1 weekends".
    router.push({
      pathname: '/(onboarding)/review',
      params: {
        sports: sportIds.join(','),
        comps: compsParam ?? '',
        teams: sportIds.map((s) => `${s}:`).join(','),
        ...manageParams(mode),
      },
    });
  }, [sportIds, compsParam, mode]);

  // F1 with no constructors in catalog: skip straight to whole-series follow.
  const f1Fallback =
    sportIds.length === 1 &&
    sportIds[0] === 'f1' &&
    Boolean(SPORT_ONBOARDING.f1?.fallbackWholeSport) &&
    !anyLoading &&
    !anyError &&
    totalVisible === 0 &&
    !manage;

  useEffect(() => {
    if (!f1Fallback) return;
    goSkip();
  }, [f1Fallback, goSkip]);

  const headline = useMemo(() => {
    if (activeSport === 'cricket') {
      return manage
        ? { a: 'YOUR', b: 'SIDES' as string | null }
        : { a: 'WHICH', b: 'SIDES?' };
    }
    if (activeSport === 'f1') {
      return manage
        ? { a: 'YOUR', b: 'TEAMS' }
        : { a: 'WHO DO YOU', b: 'CHEER FOR?' };
    }
    return manage
      ? { a: 'YOUR', b: 'TEAMS' }
      : { a: 'WHO ARE', b: 'YOUR TEAMS?' };
  }, [activeSport, manage]);

  const subcopy = useMemo(() => {
    if (activeSport === 'cricket') {
      return manage
        ? 'International sides sit at the top. You’ll get every match they play.'
        : 'Pick India, Australia, England… you’ll get every match they play.';
    }
    if (activeSport === 'f1') {
      return manage
        ? 'Constructors sit at the top. Skip to follow every race weekend.'
        : 'Pick a constructor — or skip to follow every Formula 1 weekend.';
    }
    return manage
      ? 'Saved teams sit at the top. Add or remove, then review.'
      : "Follow the crests you rearrange your day around. Skip if you don't have a favourite.";
  }, [activeSport, manage]);

  const searchPlaceholder =
    activeSport === 'cricket'
      ? 'Search international sides…'
      : activeSport === 'f1'
        ? 'Search constructors…'
        : `Search ${SPORT_LABELS[activeSport] ?? activeSport} teams…`;

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
          <Text style={[styles.h1, { color: theme.color.text }]}>{headline.a}</Text>
          {headline.b ? (
            <Text style={[styles.h1, { color: accent }]}>{headline.b}</Text>
          ) : null}
        </Animated.View>
        <Animated.Text
          entering={FadeInDown.delay(reduce ? 0 : 120).duration(reduce ? 0 : 300)}
          style={[styles.sub, { color: theme.color.textMuted }]}
        >
          {subcopy}
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
            placeholder={searchPlaceholder}
          />
        </View>

        <View style={styles.list}>
          {anyLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={accent} />
              <Text style={[styles.loadingLabel, { color: theme.color.textMuted }]}>
                Loading {SPORT_LABELS[activeSport] ?? activeSport} teams…
              </Text>
            </View>
          ) : anyError ? (
            <View style={{ paddingVertical: spacing[8] }}>
              <ErrorState
                title="Couldn't load teams"
                description="Check your connection and try again."
                onRetry={() => teamQueries.forEach((q) => void q.refetch())}
              />
            </View>
          ) : totalVisible === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: theme.color.text }]}>
                {query_ ? 'No matches' : 'No teams to show'}
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.color.textMuted }]}>
                {query_
                  ? `No ${SPORT_LABELS[activeSport] ?? activeSport} teams match “${query_}”.`
                  : "We couldn't find any teams for that combination. You can skip — the sport itself will still be followed."}
              </Text>
            </View>
          ) : (
            filteredSections.map((section, sIdx) => {
              const showHeader = section.key !== '__all__' && filteredSections.length > 1;
              return (
                <View key={section.key} style={{ marginTop: sIdx === 0 ? 0 : spacing[4] }}>
                  {showHeader || section.key === '__following__' ? (
                    <View style={{ marginHorizontal: -spacing[5] }}>
                      <SectionHeader
                        title={section.title || 'Following'}
                        trailing={
                          <Text
                            style={{
                              color: theme.color.textMuted,
                              fontSize: 11,
                              fontWeight: '600',
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            {section.teams.length}
                          </Text>
                        }
                      />
                    </View>
                  ) : null}
                  {section.teams.map((t, i) => (
                    <Animated.View
                      key={`${section.key}:${t.id}`}
                      entering={
                        reduce ? undefined : FadeInDown.delay(40 + i * 12).duration(200)
                      }
                      style={{ marginTop: i === 0 ? 0 : spacing[3] }}
                    >
                      <PickerRow
                        label={t.name}
                        sublabel={formatTeamSub(t)}
                        logoUrl={t.logoUrl}
                        accentColor={accent}
                        selected={picks[activeSport]?.has(t.id) ?? false}
                        onToggle={() => toggle(activeSport, t.id)}
                      />
                    </Animated.View>
                  ))}
                </View>
              );
            })
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
          {activeSport === 'cricket'
            ? totalPicks === 0
              ? 'Pick at least one side — you’ll get every match they play.'
              : totalPicks === 1
                ? '1 side selected · every match of theirs.'
                : `${totalPicks} sides selected.`
            : activeSport === 'f1'
              ? totalPicks === 0
                ? 'Skip to follow every Formula 1 race weekend.'
                : totalPicks === 1
                  ? '1 constructor selected.'
                  : `${totalPicks} constructors selected.`
              : totalPicks === 0
                ? 'Skip to follow entire competitions without picking sides.'
                : totalPicks === 1
                  ? '1 team selected · one to watch.'
                  : `${totalPicks} teams selected.`}
        </Text>
        <View style={styles.ctaRow}>
          <SkipButton onPress={goSkip} />
          <ContinueButton onPress={goReview} />
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatTeamSub(t: Team): string | null {
  const bits = [t.country, t.type ? capitalize(t.type) : null].filter(Boolean);
  return bits.length ? bits.join('  ·  ') : null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                   */
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
        Review
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
