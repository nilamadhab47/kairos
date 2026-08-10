import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  ErrorState,
  SportIcon,
  TeamCrest,
} from '@/components';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import {
  decodeSelections,
  isManageMode,
  OnboardingTopBar,
  SPORT_ICONS,
  SPORT_LABELS,
} from '@/lib/onboarding-shared';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Competition = {
  id: string;
  displayName: string;
  logoUrl: string | null;
  country: string | null;
  format: string | null;
};

type Team = {
  id: string;
  name: string;
  logoUrl: string | null;
  type: string | null;
  country: string | null;
};

type SubscriptionPayload = {
  category: string;
  entityType: 'category' | 'competition' | 'team';
  entityId: string;
  entityName: string;
};

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function ReviewOnboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
    sports?: string;
    comps?: string;
    teams?: string;
    mode?: string;
  }>();
  const manage = isManageMode(params.mode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sportIds = useMemo(
    () => (params.sports ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [params.sports],
  );
  const compsBySport = useMemo(() => decodeSelections(params.comps), [params.comps]);
  const teamsBySport = useMemo(() => decodeSelections(params.teams), [params.teams]);

  const allCompIds = useMemo(
    () => [...new Set(Object.values(compsBySport).flatMap((set) => [...set]))],
    [compsBySport],
  );
  const allTeamIds = useMemo(
    () => [...new Set(Object.values(teamsBySport).flatMap((set) => [...set]))],
    [teamsBySport],
  );

  // Hydrate labels + logos so the review reads like a magazine, not IDs.
  const [compQuery, teamQuery] = useQueries({
    queries: [
      {
        queryKey: ['review', 'comps', allCompIds.sort().join(',')] as const,
        queryFn: async () => {
          if (allCompIds.length === 0) return { competitions: [] as Competition[] };
          // Fetch each sport's comps and filter — simplest given the current
          // catalog API. Small N (usually <30) keeps this cheap.
          const results = await Promise.all(
            Object.keys(compsBySport).map((sid) =>
              api<{ competitions: Competition[] }>(
                `/api/catalog/competitions?category=${encodeURIComponent(sid)}&limit=200&dedupeBySeason=false`,
              ),
            ),
          );
          const wanted = new Set(allCompIds);
          const flat = results.flatMap((r) => r.competitions).filter((c) => wanted.has(c.id));
          const byId = new Map(flat.map((c) => [c.id, c]));
          return { competitions: [...byId.values()] };
        },
        staleTime: 60_000,
      },
      {
        queryKey: ['review', 'teams', allTeamIds.sort().join(',')] as const,
        queryFn: async () => {
          if (allTeamIds.length === 0) return { teams: [] as Team[] };
          const results = await Promise.all(
            Object.keys(teamsBySport).map((sid) =>
              api<{ teams: Team[] }>(
                `/api/catalog/teams?category=${encodeURIComponent(sid)}&limit=500`,
              ),
            ),
          );
          const wanted = new Set(allTeamIds);
          const flat = results.flatMap((r) => r.teams).filter((t) => wanted.has(t.id));
          const byId = new Map(flat.map((t) => [t.id, t]));
          return { teams: [...byId.values()] };
        },
        staleTime: 60_000,
      },
    ],
  });

  const compsById = useMemo(
    () => new Map((compQuery.data?.competitions ?? []).map((c) => [c.id, c])),
    [compQuery.data],
  );
  const teamsById = useMemo(
    () => new Map((teamQuery.data?.teams ?? []).map((t) => [t.id, t])),
    [teamQuery.data],
  );

  const totals = useMemo(() => {
    let comps = 0;
    let teams = 0;
    let sportWide = 0;
    for (const sid of sportIds) {
      const cs = compsBySport[sid]?.size ?? 0;
      const ts = teamsBySport[sid]?.size ?? 0;
      comps += cs;
      teams += ts;
      if (cs === 0 && ts === 0) sportWide += 1;
    }
    return { comps, teams, sportWide, sports: sportIds.length };
  }, [sportIds, compsBySport, teamsBySport]);

  const buildSubscriptionsPayload = useCallback((): SubscriptionPayload[] => {
    const subs: SubscriptionPayload[] = [];
    for (const sid of sportIds) {
      const cs = compsBySport[sid] ?? new Set<string>();
      const ts = teamsBySport[sid] ?? new Set<string>();
      // Sport-wide follow when nothing else is picked for this sport.
      if (cs.size === 0 && ts.size === 0) {
        subs.push({
          category: sid,
          entityType: 'category',
          entityId: sid,
          entityName: SPORT_LABELS[sid] ?? sid,
        });
        continue;
      }
      for (const cid of cs) {
        const c = compsById.get(cid);
        subs.push({
          category: sid,
          entityType: 'competition',
          entityId: cid,
          entityName: c?.displayName ?? cid,
        });
      }
      for (const tid of ts) {
        const t = teamsById.get(tid);
        subs.push({
          category: sid,
          entityType: 'team',
          entityId: tid,
          entityName: t?.name ?? tid,
        });
      }
    }
    return subs;
  }, [sportIds, compsBySport, teamsBySport, compsById, teamsById]);

  const onConfirm = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const subscriptions = buildSubscriptionsPayload();
      await api('/api/subscriptions', {
        method: 'PUT',
        json: { subscriptions },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['subscriptions'] }),
        qc.invalidateQueries({ queryKey: ['today'] }),
        qc.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
      haptics.success();
      if (manage) {
        // Editing from Settings — skip notifications onboarding and return.
        router.replace('/(tabs)/settings');
        return;
      }
      router.push({
        pathname: '/(onboarding)/notifications',
        params: { sports: sportIds.join(','), subsSaved: '1' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your picks');
      haptics.error();
    } finally {
      setSaving(false);
    }
  }, [saving, buildSubscriptionsPayload, sportIds, manage, qc]);

  const hydrating = compQuery.isLoading || teamQuery.isLoading;
  const anyError = compQuery.isError && teamQuery.isError;

  return (
    <View style={[styles.root, { backgroundColor: theme.color.bg }]}>
      <OnboardingTopBar showBack paddingTop={insets.top + spacing[3]} />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: spacing[16] + 96,
          paddingHorizontal: spacing[5],
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(reduce ? 0 : 340)} style={styles.headlineBlock}>
          <Text style={[styles.h1, { color: theme.color.text }]}>YOUR</Text>
          <Text style={[styles.h1, { color: theme.color.accent }]}>KAIROS.</Text>
        </Animated.View>
        <Animated.Text
          entering={FadeInDown.delay(reduce ? 0 : 100).duration(reduce ? 0 : 300)}
          style={[styles.sub, { color: theme.color.textMuted }]}
        >
          {summarySentence(totals)}
        </Animated.Text>

        {anyError ? (
          <View style={{ paddingVertical: spacing[8] }}>
            <ErrorState
              title="Couldn't load your picks"
              onRetry={() => {
                void compQuery.refetch();
                void teamQuery.refetch();
              }}
            />
          </View>
        ) : (
          sportIds.map((sid, i) => (
            <Animated.View
              key={sid}
              entering={reduce ? undefined : FadeInDown.delay(200 + i * 80).duration(280)}
              style={styles.sportBlock}
            >
              <SportSection
                sportId={sid}
                comps={[...(compsBySport[sid] ?? [])]
                  .map((id) => compsById.get(id))
                  .filter((c): c is Competition => Boolean(c))}
                teams={[...(teamsBySport[sid] ?? [])]
                  .map((id) => teamsById.get(id))
                  .filter((t): t is Team => Boolean(t))}
                allSelected={
                  (compsBySport[sid]?.size ?? 0) === 0 && (teamsBySport[sid]?.size ?? 0) === 0
                }
                hydrating={hydrating}
              />
            </Animated.View>
          ))
        )}
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
        {error ? (
          <Text style={[styles.error, { color: theme.color.danger }]}>{error}</Text>
        ) : null}
        <Text style={[styles.helper, { color: theme.color.textMuted }]}>
          {manage
            ? 'Saving replaces your current follows with this selection.'
            : 'You can rearrange all of this later in Settings.'}
        </Text>
        <View style={styles.ctaRow}>
          <BackButton onPress={() => router.back()} />
          <ConfirmButton
            loading={saving}
            onPress={onConfirm}
            label={manage ? 'Save follows' : 'Looks good'}
          />
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sport section                                                             */
/* -------------------------------------------------------------------------- */

function SportSection({
  sportId,
  comps,
  teams,
  allSelected,
  hydrating,
}: {
  sportId: string;
  comps: Competition[];
  teams: Team[];
  allSelected: boolean;
  hydrating: boolean;
}) {
  const theme = useTheme();
  const accent = theme.sport[sportId as SportKey] ?? theme.color.accent;
  const label = SPORT_LABELS[sportId] ?? sportId;

  return (
    <View>
      <View style={styles.sportHeader}>
        <View style={[styles.sportIconWrap, { borderColor: withAlpha(accent, 0.4) }]}>
          <SportIcon name={SPORT_ICONS[sportId] ?? 'default'} size={16} color={accent} />
        </View>
        <Text style={[styles.sportLabel, { color: theme.color.text }]}>{label}</Text>
        <Text style={[styles.sportCount, { color: theme.color.textFaint }]}>
          {allSelected ? 'Everything' : `${comps.length + teams.length} follows`}
        </Text>
      </View>

      {allSelected ? (
        <Text style={[styles.wholeSport, { color: theme.color.textMuted }]}>
          You'll get every {label.toLowerCase()} event that lands in the feed.
        </Text>
      ) : (
        <View style={styles.chipsWrap}>
          {hydrating && comps.length + teams.length === 0 ? (
            <ActivityIndicator color={accent} />
          ) : null}
          {comps.map((c) => (
            <ReviewChip key={c.id} label={c.displayName} logoUrl={c.logoUrl} accent={accent} />
          ))}
          {teams.map((t) => (
            <ReviewChip key={t.id} label={t.name} logoUrl={t.logoUrl} accent={accent} />
          ))}
        </View>
      )}
    </View>
  );
}

function ReviewChip({
  label,
  logoUrl,
  accent,
}: {
  label: string;
  logoUrl: string | null;
  accent: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.chip,
        {
          borderColor: withAlpha(accent, 0.35),
          backgroundColor: withAlpha(accent, 0.06),
        },
      ]}
    >
      <TeamCrest name={label} logoUrl={logoUrl} size={22} accentColor={null} />
      <Text style={[styles.chipLabel, { color: theme.color.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function summarySentence({
  sports,
  comps,
  teams,
  sportWide,
}: {
  sports: number;
  comps: number;
  teams: number;
  sportWide: number;
}): string {
  const bits: string[] = [];
  bits.push(`${sports} sport${sports === 1 ? '' : 's'}`);
  if (comps) bits.push(`${comps} competition${comps === 1 ? '' : 's'}`);
  if (teams) bits.push(`${teams} team${teams === 1 ? '' : 's'}`);
  const wholeNote =
    sportWide > 0
      ? sportWide === sports
        ? ' · Following each sport whole.'
        : ` · ${sportWide} sport${sportWide === 1 ? '' : 's'} followed whole.`
      : '';
  return `${bits.join(' · ')}${wholeNote}`;
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
/*  Buttons                                                                   */
/* -------------------------------------------------------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ConfirmButton({
  loading,
  onPress,
  label = 'Looks good',
}: {
  loading: boolean;
  onPress: () => void;
  label?: string;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={loading}
      onPressIn={() => {
        if (loading) return;
        scale.value = withSpring(0.97, motion.spring.press);
      }}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={() => {
        if (loading) return;
        haptics.medium();
        onPress();
      }}
      style={[
        styles.cta,
        { backgroundColor: theme.color.accent, flex: 1, opacity: loading ? 0.75 : 1 },
        anim,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.color.onAccent} />
      ) : (
        <Text style={{ color: theme.color.onAccent, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 }}>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => (scale.value = withSpring(0.98, motion.spring.press))}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={onPress}
      style={[styles.back, { borderColor: theme.color.border }, anim]}
    >
      <Text style={{ color: theme.color.textMuted, fontSize: 15, fontWeight: '600' }}>Back</Text>
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
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '800',
    letterSpacing: -1.4,
  },
  sub: {
    marginTop: spacing[3],
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 340,
  },
  sportBlock: {
    marginTop: spacing[6] + spacing[1],
    gap: spacing[3],
  },
  sportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  sportIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flex: 1,
  },
  sportCount: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  wholeSport: { fontSize: 14, lineHeight: 20 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: spacing[3],
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
    maxWidth: '100%',
  },
  chipLabel: { fontSize: 13, fontWeight: '600', maxWidth: 180 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  helper: { fontSize: 12, letterSpacing: 0.2 },
  error: { fontSize: 13, textAlign: 'center' },
  ctaRow: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[1] },
  cta: {
    height: 52,
    borderRadius: radii.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    height: 52,
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    minWidth: 96,
  },
});
