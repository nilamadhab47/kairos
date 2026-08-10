import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptics, motion, radii, spacing, useTheme } from '@/design';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accentColor?: string;
  leading?: React.ReactNode;
  /** Default `sm`. Use `md` for settings option pills (more vertical padding). */
  size?: 'sm' | 'md';
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Chip({
  label,
  selected,
  onPress,
  accentColor,
  leading,
  size = 'sm',
}: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const highlight = useSharedValue(selected ? 1 : 0);

  const accent = accentColor ?? theme.color.accent;
  const bgOn = withColorAlpha(accent, 0.14);
  const bgOff = theme.color.bgElevated;
  const borderOn = withColorAlpha(accent, 0.55);
  const borderOff = theme.color.border;

  useEffect(() => {
    highlight.value = withTiming(selected ? 1 : 0, { duration: motion.duration.fast });
  }, [selected, highlight]);

  const handlePress = useCallback(() => {
    haptics.select();
    onPress?.();
  }, [onPress]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: highlight.value > 0.5 ? bgOn : bgOff,
    borderColor: highlight.value > 0.5 ? borderOn : borderOff,
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPressIn={() => (scale.value = withSpring(0.96, motion.spring.press))}
      onPressOut={() => (scale.value = withSpring(1, motion.spring.press))}
      onPress={handlePress}
      style={[styles.base, size === 'md' ? styles.baseMd : null, style]}
    >
      <View style={styles.row}>
        {leading}
        <Text
          style={[
            styles.label,
            size === 'md' ? styles.labelMd : null,
            { color: selected ? theme.color.text : theme.color.textMuted },
          ]}
        >
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function withColorAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    minHeight: 32,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  baseMd: {
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    minHeight: 40,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  labelMd: { fontSize: 14, lineHeight: 18 },
});
