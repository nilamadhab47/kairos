import { forwardRef, useCallback, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { haptics, motion, radii, spacing, typography, useTheme } from '@/design';

type Variant = 'primary' | 'secondary' | 'ghost' | 'social' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leading?: ReactNode;
  hapticStyle?: 'light' | 'medium' | 'select' | 'success' | 'none';
  fullWidth?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const sizeMap: Record<Size, { height: number; padX: number; font: number }> = {
  sm: { height: 36, padX: spacing[3], font: 14 },
  md: { height: 44, padX: spacing[4], font: 15 },
  lg: { height: 52, padX: spacing[5], font: 16 },
};

export const Button = forwardRef<React.ElementRef<typeof Pressable>, Props>(
  function Button(
    {
      label,
      variant = 'primary',
      size = 'lg',
      loading,
      leading,
      hapticStyle = 'light',
      fullWidth = true,
      disabled,
      onPress,
      style,
      ...rest
    },
    ref,
  ) {
    const theme = useTheme();
    const scale = useSharedValue(1);
    const isDisabled = disabled || loading;
    const dims = sizeMap[size];

    const surface = variantSurface(variant, theme);
    const label$ = variantLabelColor(variant, theme);
    const border = variantBorder(variant, theme);

    const onPressIn = useCallback(() => {
      if (isDisabled) return;
      scale.value = withSpring(0.97, motion.spring.press);
    }, [isDisabled, scale]);

    const onPressOut = useCallback(() => {
      scale.value = withSpring(1, motion.spring.press);
    }, [scale]);

    const handlePress = useCallback(
      (e: GestureResponderEvent) => {
        if (isDisabled) return;
        if (hapticStyle !== 'none') haptics[hapticStyle]();
        onPress?.(e);
      },
      [hapticStyle, isDisabled, onPress],
    );

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedPressable
        ref={ref}
        accessibilityRole="button"
        disabled={isDisabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={handlePress}
        style={[
          styles.base,
          {
            height: dims.height,
            paddingHorizontal: dims.padX,
            backgroundColor: surface,
            borderColor: border ?? 'transparent',
            borderWidth: border ? StyleSheet.hairlineWidth : 0,
            opacity: isDisabled ? 0.45 : 1,
            alignSelf: fullWidth ? 'stretch' : 'flex-start',
          },
          animatedStyle,
          style as object,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={label$} />
        ) : (
          <View style={styles.row}>
            {leading}
            <Text
              style={[
                styles.label,
                { color: label$, fontSize: dims.font, fontWeight: typography.bodyStrong.weight },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        )}
      </AnimatedPressable>
    );
  },
);

function variantSurface(v: Variant, t: ReturnType<typeof useTheme>) {
  switch (v) {
    case 'primary':
      return t.color.accent;
    case 'secondary':
    case 'social':
      return t.color.bgElevated;
    case 'ghost':
      return 'transparent';
    case 'danger':
      return t.color.danger;
  }
}

function variantLabelColor(v: Variant, t: ReturnType<typeof useTheme>) {
  switch (v) {
    case 'primary':
      return t.color.onAccent;
    case 'danger':
      return '#fff';
    default:
      return t.color.text;
  }
}

function variantBorder(v: Variant, t: ReturnType<typeof useTheme>): string | null {
  if (v === 'secondary' || v === 'social') return t.color.border;
  return null;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.btn,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { letterSpacing: 0.1 },
});
