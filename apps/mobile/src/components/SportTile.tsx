import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';

type Props = {
  id: SportKey | string;
  label: string;
  selected: boolean;
  onToggle: () => void;
  accentColor: string;
  glyph?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Selectable tile for onboarding. Subtle press squish, spring-in check,
 * accent wash on selection. No noise for unselected state.
 */
export function SportTile({ id, label, selected, onToggle, accentColor, glyph }: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const highlight = useSharedValue(selected ? 1 : 0);
  const check = useSharedValue(selected ? 1 : 0);
  const reduce = useReducedMotion();

  useEffect(() => {
    highlight.value = withTiming(selected ? 1 : 0, {
      duration: reduce ? 0 : motion.duration.base,
    });
    check.value = selected
      ? withSpring(1, motion.spring.soft)
      : withTiming(0, { duration: reduce ? 0 : motion.duration.fast });
  }, [selected, reduce, highlight, check]);

  const onPress = useCallback(() => {
    haptics.select();
    onToggle();
  }, [onToggle]);

  // Precompute off the UI thread — withAlpha is not a worklet.
  const bgOff = theme.color.bgElevated;
  const bgOn = withAlpha(accentColor, 0.14);
  const borderOff = theme.color.border;
  const borderOn = withAlpha(accentColor, 0.55);

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(highlight.value, [0, 1], [bgOff, bgOn]),
    borderColor: interpolateColor(highlight.value, [0, 1], [borderOff, borderOn]),
  }));

  const glyphStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.08 * highlight.value }],
    opacity: 0.75 + 0.25 * highlight.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: 0.7 + 0.3 * check.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPressIn={() => (scale.value = withSpring(0.97, motion.spring.press))}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={onPress}
      style={[styles.tile, tileStyle]}
    >
      <Animated.Text style={[styles.glyph, glyphStyle, { color: accentColor }]}>
        {glyph ?? sportGlyph(id)}
      </Animated.Text>
      <Text style={[styles.label, { color: theme.color.text }]}>{label}</Text>
      <Animated.View style={[styles.check, { backgroundColor: accentColor }, checkStyle]}>
        <Text style={{ color: theme.color.onAccent, fontWeight: '800', fontSize: 12 }}>✓</Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

function sportGlyph(id: string): string {
  switch (id) {
    case 'football':
      return '⚽';
    case 'f1':
      return '🏁';
    case 'cricket':
      return '🏏';
    case 'tennis':
      return '🎾';
    case 'basketball':
      return '🏀';
    default:
      return '•';
  }
}

function withAlpha(hex: string, a: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const styles = StyleSheet.create({
  tile: {
    width: '48%',
    height: 128,
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  glyph: { fontSize: 30 },
  label: { fontSize: 16, fontWeight: '600' },
  check: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
