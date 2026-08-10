import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator } from 'react-native';
import {
  KairosMark,
  KairosMomentPulse,
  KairosWordmark,
} from '@/components';
import { haptics, motion, radii, spacing, useTheme } from '@/design';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { registerPushDevice } from '@/lib/push';

const SPORT_LABELS: Record<string, string> = {
  f1: 'Formula 1',
  football: 'Football',
  cricket: 'Cricket',
  tennis: 'Tennis',
  basketball: 'Basketball',
  hockey: 'Ice Hockey',
  baseball: 'Baseball',
};

export default function NotificationsOnboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { sports: sportsParam, subsSaved } = useLocalSearchParams<{
    sports?: string;
    subsSaved?: string;
  }>();
  const [loading, setLoading] = useState<'enable' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sportIds = (sportsParam ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Reviewed via /(onboarding)/review — subscriptions are already persisted.
  // Otherwise (e.g. bypass or legacy path) seed sport-wide follows here.
  const subsAlreadySaved = subsSaved === '1';

  const finish = useCallback(async () => {
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api('/api/me/onboarding/complete', {
        method: 'POST',
        json: {
          timezone,
          ...(subsAlreadySaved
            ? {}
            : {
                sports: sportIds.map((category) => ({
                  category,
                  entityType: 'category',
                  entityId: category,
                  entityName: SPORT_LABELS[category] ?? category,
                })),
              }),
        },
      });
      await authClient.getSession({ query: { disableCookieCache: true } });
      router.replace('/(tabs)/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish onboarding');
      throw e;
    }
  }, [sportIds, subsAlreadySaved]);

  const onEnable = useCallback(async () => {
    setLoading('enable');
    setError(null);
    try {
      const result = await registerPushDevice({ requestPermission: true });
      // Denied / unavailable is not an error — the app still works. Continue.
      if (!result.ok && result.reason === 'error') {
        setError(result.message ?? 'Could not register device');
        setLoading(null);
        return;
      }
      if (result.ok) haptics.success();
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permission failed');
    } finally {
      setLoading(null);
    }
  }, [finish]);

  const onSkip = useCallback(async () => {
    setLoading('skip');
    try {
      await finish();
    } finally {
      setLoading(null);
    }
  }, [finish]);

  return (
    <View style={[styles.root, { backgroundColor: theme.color.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing[3] }]}>
        <KairosMark size={22} color={theme.color.accent} />
        <KairosWordmark width={74} color={theme.color.accent} strokeWidth={12} />
      </View>

      <View style={styles.body}>
        <Animated.View
          entering={FadeInUp.duration(reduce ? 0 : 380)}
          style={styles.pulseWrap}
        >
          <KairosMomentPulse size={220} />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(reduce ? 0 : 200).duration(reduce ? 0 : 360)}
          style={styles.copy}
        >
          <Text style={[styles.h1, { color: theme.color.text }]}>NEVER MISS</Text>
          <Text style={[styles.h1, { color: theme.color.accent }]}>THE START.</Text>
          <Text style={[styles.sub, { color: theme.color.textMuted }]}>
            One gentle nudge{'\u2003'}·{'\u2003'}about 15 minutes before the matches and races
            you follow. Nothing else.
          </Text>
        </Animated.View>
      </View>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom + spacing[3], spacing[6]),
          },
        ]}
      >
        {error ? (
          <Text style={[styles.error, { color: theme.color.danger }]}>{error}</Text>
        ) : null}
        <PrimaryButton
          label="Enable alerts"
          loading={loading === 'enable'}
          disabled={loading === 'skip'}
          onPress={() => void onEnable()}
        />
        <SecondaryButton
          label="Not now"
          loading={loading === 'skip'}
          disabled={loading === 'enable'}
          onPress={() => void onSkip()}
        />
        <Text style={[styles.fine, { color: theme.color.textFaint }]}>
          You can change this anytime in Settings.
        </Text>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                   */
/* -------------------------------------------------------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PrimaryButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={() => {
        if (isDisabled) return;
        scale.value = withSpring(0.97, motion.spring.press);
      }}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={() => {
        if (isDisabled) return;
        haptics.medium();
        onPress();
      }}
      style={[
        styles.primary,
        { backgroundColor: theme.color.accent, opacity: isDisabled ? 0.6 : 1 },
        anim,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.color.onAccent} />
      ) : (
        <Text style={[styles.primaryLabel, { color: theme.color.onAccent }]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

function SecondaryButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={() => {
        if (isDisabled) return;
        scale.value = withSpring(0.98, motion.spring.press);
      }}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={() => {
        if (isDisabled) return;
        onPress();
      }}
      style={[styles.secondary, { opacity: isDisabled ? 0.5 : 1 }, anim]}
    >
      {loading ? (
        <ActivityIndicator color={theme.color.textMuted} />
      ) : (
        <Text style={[styles.secondaryLabel, { color: theme.color.textMuted }]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  pulseWrap: {
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  copy: {
    alignItems: 'center',
  },
  h1: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  sub: {
    marginTop: spacing[4],
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    gap: spacing[3],
  },
  error: { fontSize: 13, textAlign: 'center' },
  primary: {
    height: 52,
    borderRadius: radii.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  secondary: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  fine: {
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginTop: spacing[1],
  },
});
