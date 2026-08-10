import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { haptics, radii, useTheme } from '@/design';

export type SegmentOption<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Compact height (default 32) — good for header controls. */
  size?: 'sm' | 'md';
  accessibilityLabel?: string;
};

/**
 * Compact segmented control — two or more mutually-exclusive options with
 * a smoothly sliding indicator behind the active label.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  accessibilityLabel,
}: Props<T>) {
  const theme = useTheme();
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  const segCount = options.length;
  const height = size === 'sm' ? 30 : 36;
  const pad = 3;
  const inner = height - pad * 2;

  const indicatorX = useSharedValue(activeIndex);
  useEffect(() => {
    indicatorX.value = withTiming(activeIndex, { duration: 200 });
  }, [activeIndex, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    // 100% of a segment width is 1/segCount of the outer track.
    left: `${(indicatorX.value * 100) / segCount}%`,
  }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        {
          height,
          padding: pad,
          backgroundColor: theme.color.bgSunken,
          borderColor: theme.color.border,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.indicator,
          indicatorStyle,
          {
            width: `${100 / segCount}%`,
            height: inner,
            backgroundColor: theme.color.surface,
            borderColor: theme.color.border,
            borderRadius: radii.pill,
          },
        ]}
      />
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) {
                haptics.select();
                onChange(opt.id);
              }
            }}
            style={[styles.seg, { height: inner }]}
          >
            <Text
              numberOfLines={1}
              allowFontScaling={false}
              style={{
                color: active ? theme.color.text : theme.color.textMuted,
                fontSize: 12,
                fontWeight: '700',
                letterSpacing: 0.4,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  seg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
