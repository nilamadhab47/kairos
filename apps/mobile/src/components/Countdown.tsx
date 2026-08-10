import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useTheme } from '@/design';
import { clockCountdown, humanCountdown, useNow } from '@/lib/time';

type Props = {
  startsAt: string;
  /** 'clock' shows MM:SS when < 1h; 'phrase' shows "in 2h 15m". */
  variant?: 'clock' | 'phrase';
  /** Highlight color when < threshold minutes. */
  soonAccent?: string;
  soonMinutes?: number;
  size?: 'sm' | 'md' | 'lg';
};

export function Countdown({
  startsAt,
  variant = 'phrase',
  soonAccent,
  soonMinutes = 15,
  size = 'md',
}: Props) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const startMs = new Date(startsAt).getTime();
  // A live H:MM:SS clock is only meaningful once we're inside the last day —
  // beyond that it produces silly strings like "242:19:07" that also overflow
  // the card. For far-off events we drop back to the phrase form.
  const withinClockWindow = startMs - Date.now() < 24 * 60 * 60 * 1000 && startMs - Date.now() > 0;
  const effectiveVariant: 'clock' | 'phrase' =
    variant === 'clock' && withinClockWindow ? 'clock' : 'phrase';
  const now = useNow(effectiveVariant === 'clock' ? 1_000 : 30_000);
  const soon = startMs - now < soonMinutes * 60_000 && startMs - now > 0;
  const text =
    effectiveVariant === 'clock' ? clockCountdown(startMs, now) : humanCountdown(startMs, now);

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!soon || reduce) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })),
      -1,
      false,
    );
  }, [soon, reduce, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.5 * pulse.value,
    transform: [{ scale: 1 + 0.2 * pulse.value }],
  }));

  const color = soon && soonAccent ? soonAccent : theme.color.text;
  // Big display font is only right for the live clock — the phrase form
  // ("in 11d", "tomorrow") reads much better at a more restrained size.
  const font =
    effectiveVariant === 'clock'
      ? size === 'lg'
        ? 30
        : size === 'sm'
          ? 13
          : 16
      : size === 'lg'
        ? 16
        : size === 'sm'
          ? 12
          : 14;

  return (
    <View style={styles.wrap}>
      {soon ? (
        <Animated.View style={[styles.dot, { backgroundColor: soonAccent ?? theme.color.accent }, dotStyle]} />
      ) : null}
      <Text
        numberOfLines={1}
        style={{
          color,
          fontSize: font,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
          letterSpacing: -0.3,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 999 },
});
