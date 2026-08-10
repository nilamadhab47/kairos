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
  SportRow,
  type SportIconName,
} from '@/components';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import {
  type FollowsSummary,
  isManageMode,
  manageParams,
  OnboardingTopBar,
  sportIdsFromSummary,
} from '@/lib/onboarding-shared';

/* -------------------------------------------------------------------------- */
/*  Backend types                                                             */
/* -------------------------------------------------------------------------- */

type CatalogStatus = 'live' | 'ready' | 'unavailable';

type CatalogSport = {
  category: string;
  label: string;
  providers: string[];
  hasHealthyProvider: boolean;
  matchCount: number;
  teamCount: number;
  status: CatalogStatus;
};

type CatalogResponse = { sports: CatalogSport[] };

/** Short, honest hint per sport. No live competition lists — we don't fetch
 * competitions in this screen; we describe *scope* rather than fabricate names.
 */
const HINTS: Record<string, string> = {
  football: 'Leagues, cups & internationals',
  cricket: 'Internationals, IPL & tours',
  f1: 'Every race weekend',
  tennis: 'Grand Slams · ATP · WTA',
  basketball: 'NBA & internationals',
  hockey: 'NHL & internationals',
  baseball: 'MLB & internationals',
};

const ICONS: Record<string, SportIconName> = {
  football: 'football',
  cricket: 'cricket',
  f1: 'f1',
  tennis: 'tennis',
  basketball: 'basketball',
  hockey: 'hockey',
  baseball: 'baseball',
};

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function SportsOnboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const manage = isManageMode(mode);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hydrated = useRef(false);

  const catalog = useQuery({
    queryKey: ['catalog', 'sports'],
    queryFn: () => api<CatalogResponse>('/api/catalog/sports'),
    staleTime: 60_000,
  });

  const summary = useQuery({
    queryKey: ['subscriptions', 'summary'],
    queryFn: () => api<FollowsSummary>('/api/subscriptions/summary'),
    enabled: manage,
    staleTime: 30_000,
  });

  // Prefill from saved follows once when editing.
  useEffect(() => {
    if (!manage || !summary.data || hydrated.current) return;
    setSelected(new Set(sportIdsFromSummary(summary.data)));
    hydrated.current = true;
  }, [manage, summary.data]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canContinue = selected.size > 0;

  const onContinue = useCallback(() => {
    if (!canContinue) return;
    haptics.success();
    router.push({
      pathname: '/(onboarding)/competitions',
      params: { sports: [...selected].join(','), ...manageParams(mode) },
    });
  }, [canContinue, selected, mode]);

  const helper = useMemo(() => {
    if (selected.size === 0) return 'Pick at least one · you can change this later.';
    if (selected.size === 1) return '1 sport selected · nice start.';
    return `${selected.size} sports selected · looking good.`;
  }, [selected.size]);

  // Selectable first, then coming-soon; within each group pin already-followed.
  const sortedSports = useMemo(() => {
    const rows = catalog.data?.sports ?? [];
    const selectable = rows.filter((s) => s.status !== 'unavailable');
    const soon = rows.filter((s) => s.status === 'unavailable');
    const pin = (list: CatalogSport[]) => [
      ...list.filter((s) => selected.has(s.category)),
      ...list.filter((s) => !selected.has(s.category)),
    ];
    return [...pin(selectable), ...pin(soon)];
  }, [catalog.data, selected]);

  const loading = catalog.isLoading || (manage && summary.isLoading && !hydrated.current);

  return (
    <View style={[styles.root, { backgroundColor: theme.color.bg }]}>
      <OnboardingTopBar
        showBack={manage}
        paddingTop={insets.top + spacing[3]}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/settings');
        }}
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: spacing[16] + 64,
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
              <Text style={[styles.h1, { color: theme.color.text }]}>EDIT</Text>
              <Text style={[styles.h1, { color: theme.color.text }]}>WHAT YOU</Text>
              <Text style={[styles.h1, { color: theme.color.accent }]}>FOLLOW</Text>
            </>
          ) : (
            <>
              <Text style={[styles.h1, { color: theme.color.text }]}>WHAT</Text>
              <Text style={[styles.h1, { color: theme.color.text }]}>MATTERS</Text>
              <Text style={[styles.h1, { color: theme.color.accent }]}>TO YOU?</Text>
            </>
          )}
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(reduce ? 0 : 120).duration(reduce ? 0 : 300)}
          style={[styles.sub, { color: theme.color.textMuted }]}
        >
          {manage
            ? 'Your current sports are selected. Add or remove, then continue.'
            : 'Follow what you love. Kairos builds your day around it.'}
        </Animated.Text>

        <View style={styles.list}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.color.accent} />
              <Text style={[styles.loadingLabel, { color: theme.color.textMuted }]}>
                {manage ? 'Loading your follows…' : 'Loading your sports…'}
              </Text>
            </View>
          ) : catalog.isError ? (
            <View style={styles.errorWrap}>
              <ErrorState
                title="Couldn't load sports"
                description="Check your connection and try again."
                onRetry={() => void catalog.refetch()}
              />
            </View>
          ) : (
            sortedSports.map((sport, i) => (
              <Animated.View
                key={sport.category}
                entering={
                  reduce ? undefined : FadeInDown.delay(120 + i * 45).duration(280)
                }
              >
                <SportRow
                  iconName={ICONS[sport.category] ?? 'default'}
                  label={sport.label}
                  hint={HINTS[sport.category] ?? undefined}
                  selected={selected.has(sport.category)}
                  disabled={sport.status === 'unavailable'}
                  accentColor={
                    theme.sport[sport.category as SportKey] ?? theme.color.accent
                  }
                  onToggle={() => toggle(sport.category)}
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
        <Text style={[styles.helper, { color: theme.color.textMuted }]}>{helper}</Text>
        <ContinueButton disabled={!canContinue} onPress={onContinue} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Continue button — locally-defined so we can tune disabled transition.     */
/* -------------------------------------------------------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ContinueButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withSpring(0.97, motion.spring.press);
      }}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={() => {
        if (disabled) return;
        haptics.light();
        onPress();
      }}
      style={[
        styles.cta,
        {
          backgroundColor: disabled ? theme.color.surface : theme.color.accent,
          opacity: disabled ? 0.55 : 1,
        },
        anim,
      ]}
    >
      <Text
        style={{
          color: disabled ? theme.color.textMuted : theme.color.onAccent,
          fontSize: 16,
          fontWeight: '700',
          letterSpacing: 0.2,
        }}
      >
        Continue
      </Text>
    </AnimatedPressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1 },
  headlineBlock: {
    marginTop: spacing[4],
    gap: -4,
  },
  h1: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  sub: {
    marginTop: spacing[3],
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
  },
  list: {
    marginTop: spacing[6],
    gap: spacing[3],
  },
  loading: {
    paddingVertical: spacing[10],
    alignItems: 'center',
    gap: spacing[3],
  },
  loadingLabel: { fontSize: 13 },
  errorWrap: { paddingVertical: spacing[8] },
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
  cta: {
    height: 52,
    borderRadius: radii.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
