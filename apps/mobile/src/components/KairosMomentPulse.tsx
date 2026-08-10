import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { KairosMark } from './KairosMark';
import { useTheme } from '@/design';

type Props = {
  size?: number;
  color?: string;
};

/**
 * Notifications-onboarding hero.
 *
 * Concept: the Kairos symbol is *the moment*. Two very soft rings expand
 * outward from it and fade — signalling "a moment is approaching you". Under
 * the mark, a faint radial glow gives the sense of an ambient signal.
 *
 * Motion is intentionally slow — ~2.4s cycle — so it reads as "breathing",
 * not as an alert. All motion collapses to a static frame under reduce-motion.
 */
export function KairosMomentPulse({ size = 220, color }: Props) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const accent = color ?? theme.color.accent;

  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    // Ring 1 starts immediately; ring 2 offset by ~1.1s so the pulses interleave.
    const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
    p1.value = withRepeat(withTiming(1, { duration: 2400, easing: ease }), -1, false);
    p2.value = withDelay(
      1100,
      withRepeat(withTiming(1, { duration: 2400, easing: ease }), -1, false),
    );
    breath.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduce, p1, p2, breath]);

  const ring1Style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p1.value),
    transform: [{ scale: 0.55 + 0.45 * p1.value }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - p2.value),
    transform: [{ scale: 0.55 + 0.45 * p2.value }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.98 + 0.04 * breath.value }],
  }));

  const ringSize = size;
  const glowSize = size * 1.15;

  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none">
      {/* Ambient radial glow */}
      <View style={[styles.absCenter, { width: glowSize, height: glowSize }]}>
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="pulse-glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={accent} stopOpacity={0.18} />
              <Stop offset="45%" stopColor={accent} stopOpacity={0.05} />
              <Stop offset="100%" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={glowSize} height={glowSize} fill="url(#pulse-glow)" />
        </Svg>
      </View>

      {/* Two expanding rings */}
      <Animated.View
        style={[
          styles.ring,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: accent },
          ring1Style,
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: accent },
          ring2Style,
        ]}
      />

      {/* Central moment — the real Kairos mark, gently breathing. */}
      <Animated.View style={markStyle}>
        <KairosMark size={size * 0.36} color={accent} mode="static" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  absCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 1,
  },
});
