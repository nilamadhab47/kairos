import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/design';

/**
 * Onboarding-scale hero for the notifications screen.
 * Two soft rings gently pulsing outward — hints "we'll ping you when it matters"
 * without being flashy. Falls back to static rings under reduce-motion.
 */
export function AlertsPulse({ size = 160 }: { size?: number }) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    p1.value = withRepeat(withSequence(withTiming(1, { duration: 1800 })), -1, false);
    p2.value = withRepeat(
      withSequence(withTiming(0, { duration: 900 }), withTiming(1, { duration: 1800 })),
      -1,
      false,
    );
  }, [reduce, p1, p2]);

  const ring1 = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - p1.value),
    transform: [{ scale: 0.5 + 0.8 * p1.value }],
  }));
  const ring2 = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - p2.value),
    transform: [{ scale: 0.5 + 0.8 * p2.value }],
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.ring,
          { width: size, height: size, borderColor: theme.color.accent, borderRadius: size / 2 },
          ring1,
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          { width: size, height: size, borderColor: theme.color.accent, borderRadius: size / 2 },
          ring2,
        ]}
      />
      <View
        style={[
          styles.core,
          {
            backgroundColor: theme.color.bgElevated,
            borderColor: theme.color.accent,
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: (size * 0.42) / 2,
          },
        ]}
      >
        <Text style={{ fontSize: size * 0.22 }}>🔔</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
