import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { fonts, haptics, motion, spacing, useTheme, type SportKey } from '@/design';

export type DayCell = {
  /** YYYY-MM-DD in the target tz. */
  key: string;
  date: Date;
  weekdayShort: string;
  dayNum: number;
  isToday: boolean;
  sports: SportKey[];
  count: number;
};

type Props = {
  days: DayCell[];
  selectedKey: string;
  onSelect: (key: string) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Horizontal 7-day strip with sport-color dots per day and a spring-in accent circle for the selected day. */
export function WeekStrip({ days, selectedKey, onSelect }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {days.map((d) => (
        <DayPill
          key={d.key}
          day={d}
          selected={d.key === selectedKey}
          onSelect={() => {
            haptics.select();
            onSelect(d.key);
          }}
          accent={theme.color.accent}
        />
      ))}
    </View>
  );
}

function DayPill({
  day,
  selected,
  onSelect,
  accent,
}: {
  day: DayCell;
  selected: boolean;
  onSelect: () => void;
  accent: string;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const sel = useSharedValue(selected ? 1 : 0);

  const onPressIn = useCallback(() => {
    scale.value = withSpring(0.94, motion.spring.press);
  }, [scale]);
  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, motion.spring.press);
  }, [scale]);

  sel.value = withSpring(selected ? 1 : 0, motion.spring.soft);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(
      sel.value,
      [0, 1],
      ['transparent', theme.color.surfacePressed],
    ),
    borderColor: interpolateColor(sel.value, [0, 1], [theme.color.border, theme.color.borderStrong]),
  }));
  const stripeStyle = useAnimatedStyle(() => ({
    opacity: sel.value,
  }));

  return (
    <AnimatedPressable
      onPress={onSelect}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${day.weekdayShort} ${day.dayNum}, ${day.count} events`}
      accessibilityState={{ selected }}
      style={[styles.cell, wrapStyle]}
    >
      <Text
        style={[
          styles.weekday,
          {
            color: day.isToday ? accent : theme.color.textMuted,
          },
        ]}
      >
        {day.weekdayShort}
      </Text>
      <Text
        style={[
          styles.dayNum,
          { color: selected ? theme.color.text : theme.color.textMuted },
        ]}
      >
        {day.dayNum}
      </Text>
      <View style={styles.dots}>
        {day.sports.slice(0, 3).map((s) => (
          <View key={s} style={[styles.dot, { backgroundColor: theme.sport[s] ?? accent }]} />
        ))}
        {day.sports.length === 0 ? <View style={styles.dotSpacer} /> : null}
      </View>
      {/* Selected-day bottom stripe in the primary accent — design signature. */}
      <Animated.View style={[styles.stripe, { backgroundColor: accent }, stripeStyle]} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    gap: 5,
  },
  // Design spec: date cells ~52x70, radius 12, filled when selected with an
  // accent bottom stripe.
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 70,
    gap: 5,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  weekday: { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.bodyBold },
  dayNum: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    fontFamily: fonts.display,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 999 },
  dotSpacer: { height: 5 },
  stripe: {
    position: 'absolute',
    bottom: 0,
    left: 10,
    right: 10,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
