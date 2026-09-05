import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { fonts, radii, spacing, useTheme } from '@/design';

export type MatchState = 'live' | 'upcoming' | 'ft' | 'postponed' | 'cancelled';

type Props = {
  state: MatchState;
  label?: string;
};

export function StatusPill({ state, label }: Props) {
  const theme = useTheme();
  const meta = pillMeta(state, theme, label);
  const pulse = useSharedValue(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (state !== 'live' || reduce) {
      pulse.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [state, reduce, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: state === 'live' ? 0.55 + 0.45 * pulse.value : 1,
    transform: [
      { scale: state === 'live' ? 1 + 0.15 * pulse.value : 1 },
    ],
  }));

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: meta.bg, borderColor: meta.border ?? 'transparent' },
      ]}
      accessibilityLabel={`match ${state}`}
    >
      <Animated.View style={[styles.dot, { backgroundColor: meta.dot }, dotStyle]} />
      <Text style={[styles.label, { color: meta.fg }]}>{meta.text}</Text>
    </View>
  );
}

function pillMeta(state: MatchState, theme: ReturnType<typeof useTheme>, override?: string) {
  switch (state) {
    case 'live':
      // Electric match pulse — blue per the Obsidian Precision design.
      return {
        text: override ?? 'LIVE',
        fg: theme.color.live,
        dot: theme.color.live,
        bg: 'rgba(96, 165, 250, 0.12)',
        border: 'rgba(96, 165, 250, 0.3)',
      };
    case 'ft':
      return {
        text: override ?? 'FULL TIME',
        fg: theme.color.textMuted,
        dot: theme.color.textMuted,
        bg: theme.color.bgElevated,
        border: theme.color.border,
      };
    case 'postponed':
    case 'cancelled':
      return {
        text: override ?? state.toUpperCase(),
        fg: theme.color.warn,
        dot: theme.color.warn,
        bg: 'rgba(246, 184, 75, 0.1)',
        border: 'rgba(246, 184, 75, 0.35)',
      };
    default:
      return {
        text: override ?? 'UPCOMING',
        fg: theme.color.textMuted,
        dot: theme.color.textFaint,
        bg: theme.color.bgElevated,
        border: theme.color.border,
      };
  }
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    fontFamily: fonts.bodyBold,
  },
});
