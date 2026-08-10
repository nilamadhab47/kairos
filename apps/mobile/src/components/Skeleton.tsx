import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radii, useTheme } from '@/design';

type Props = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = '100%', height = 14, radius = radii.sm, style }: Props) {
  const theme = useTheme();
  const shimmer = useSharedValue(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    shimmer.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
  }, [reduce, shimmer]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.35 * shimmer.value,
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width: width as ViewStyle['width'],
          height,
          borderRadius: radius,
          backgroundColor: theme.color.bgElevated,
        },
        animated,
        style,
      ]}
    />
  );
}

export function SkeletonCard({ height = 96 }: { height?: number } = {}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          minHeight: height,
        },
      ]}
    >
      <Skeleton width={60} height={12} />
      <View style={{ height: 12 }} />
      <Skeleton width="70%" height={18} />
      <View style={{ height: 8 }} />
      <Skeleton width="45%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  card: {
    padding: 16,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
