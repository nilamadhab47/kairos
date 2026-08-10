import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { elevation, motion, radii, spacing, useTheme } from '@/design';

type Props = {
  onPress?: () => void;
  children: ReactNode;
  padded?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({ onPress, children, padded = true, style, accessibilityLabel }: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    if (!onPress) return;
    scale.value = withSpring(0.985, motion.spring.press);
  }, [onPress, scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, motion.spring.press);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.card,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          padding: padded ? spacing[4] : 0,
        },
        elevation.card,
        animatedStyle,
        style as object,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
