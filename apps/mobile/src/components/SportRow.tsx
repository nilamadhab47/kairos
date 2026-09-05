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
import { SportIcon, type SportIconName } from './SportIcon';
import { fonts, haptics, motion, radii, spacing, useTheme } from '@/design';

type Props = {
  iconName: SportIconName | string;
  label: string;
  hint?: string;
  /** Small accent-colored pill next to the sport name (e.g. "Pitchside"). */
  badge?: string;
  selected: boolean;
  disabled?: boolean;
  accentColor: string;
  onToggle?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A single sport row in the onboarding picker.
 *
 * States:
 *   idle       — subtle border, muted icon
 *   pressed    — 0.98 scale, spring
 *   selected   — accent-tinted border + faint bg wash + check
 *   disabled   — reduced opacity, "COMING SOON" pill, no interaction
 *
 * All colour transitions happen on the UI thread through `interpolateColor`.
 */
export function SportRow({
  iconName,
  label,
  hint,
  badge,
  selected,
  disabled,
  accentColor,
  onToggle,
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

  // Precomputed non-worklet colour values.
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

  const iconColor = disabled
    ? theme.color.textFaint
    : selected
      ? accentColor
      : theme.color.textMuted;

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={`${label}${disabled ? ', coming soon' : ''}`}
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withSpring(0.98, motion.spring.press);
      }}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={onPress}
      style={[
        styles.row,
        rowStyle,
        {
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {/* Leading-edge sport accent bar */}
      <View style={[styles.accentBar, { backgroundColor: disabled ? theme.color.border : accentColor }]} />

      <View
        style={[
          styles.iconWrap,
          { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border },
        ]}
      >
        <SportIcon name={iconName} size={22} color={iconColor} />
      </View>

      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.label, { color: disabled ? theme.color.textMuted : theme.color.text }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {badge && !disabled ? (
            <View style={[styles.tagPill, { backgroundColor: withAlpha(accentColor, 0.12) }]}>
              <Text style={[styles.tagText, { color: accentColor }]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {hint ? (
          <Text style={[styles.hint, { color: theme.color.textFaint }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>

      {disabled ? (
        <View style={[styles.badge, { borderColor: theme.color.border }]}>
          <Text style={[styles.badgeLabel, { color: theme.color.textFaint }]}>SOON</Text>
        </View>
      ) : (
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
      )}
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
    minHeight: 76,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { fontSize: 17, fontWeight: '600', letterSpacing: -0.1, fontFamily: fonts.displayMedium },
  tagPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: 999,
  },
  tagText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, fontFamily: fonts.bodyBold },
  hint: { fontSize: 12, letterSpacing: 0.1, fontFamily: fonts.body },
  check: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
});
