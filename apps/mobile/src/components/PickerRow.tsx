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
import Svg, { Path } from 'react-native-svg';
import { TeamCrest } from './TeamCrest';
import { haptics, motion, radii, spacing, useTheme } from '@/design';

type Props = {
  /** Primary label shown large on the row. */
  label: string;
  /** Small secondary line under the label (country, format, tier, etc.). */
  sublabel?: string | null;
  /** Optional logo URL — falls back to initials in a round crest. */
  logoUrl?: string | null;
  selected: boolean;
  accentColor: string;
  onToggle?: () => void;
  disabled?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A generic multi-select row for competition/team pickers in the
 * personalisation flow. Shares the exact selection language as
 * SportRow (accent-tinted border, spring check-in) so onboarding
 * feels like one continuous gesture across screens.
 */
export function PickerRow({
  label,
  sublabel,
  logoUrl,
  selected,
  accentColor,
  onToggle,
  disabled,
}: Props) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const highlight = useSharedValue(selected ? 1 : 0);
  const check = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    highlight.value = withTiming(selected ? 1 : 0, {
      duration: reduce ? 0 : motion.duration.base,
    });
    check.value = selected
      ? withSpring(1, motion.spring.soft)
      : withTiming(0, { duration: reduce ? 0 : motion.duration.fast });
  }, [selected, reduce, highlight, check]);

  const onPress = useCallback(() => {
    if (disabled) return;
    haptics.select();
    onToggle?.();
  }, [disabled, onToggle]);

  const bgOff = theme.color.bgElevated;
  const bgOn = withAlpha(accentColor, 0.08);
  const borderOff = theme.color.border;
  const borderOn = withAlpha(accentColor, 0.55);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(highlight.value, [0, 1], [bgOff, bgOn]),
    borderColor: interpolateColor(highlight.value, [0, 1], [borderOff, borderOn]),
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: 0.7 + 0.3 * check.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withSpring(0.98, motion.spring.press);
      }}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={onPress}
      style={[styles.row, rowStyle, { opacity: disabled ? 0.45 : 1 }]}
    >
      <TeamCrest name={label} logoUrl={logoUrl} size={40} accentColor={selected ? accentColor : null} />

      <View style={styles.textCol}>
        <Text
          style={[styles.label, { color: theme.color.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={[styles.sub, { color: theme.color.textFaint }]} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.check,
          { borderColor: theme.color.border },
          selected && { borderColor: accentColor, backgroundColor: accentColor },
        ]}
      >
        <Animated.View style={checkStyle}>
          <CheckGlyph color={theme.color.onAccent} />
        </Animated.View>
      </Animated.View>
    </AnimatedPressable>
  );
}

function CheckGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Path
        d="M2 6.5 L5 9.2 L10 3.2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  textCol: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600', letterSpacing: -0.1 },
  sub: { fontSize: 12, letterSpacing: 0.1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
