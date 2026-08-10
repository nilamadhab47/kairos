import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';

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
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(sel.value, [0, 1], ['transparent', accent]),
    borderColor: interpolateColor(sel.value, [0, 1], [theme.color.border, accent]),
  }));
  const numStyle = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [theme.color.text, theme.color.onAccent]),
  }));

  return (
    <AnimatedPressable
      onPress={onSelect}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${day.weekdayShort} ${day.dayNum}, ${day.count} events`}
      accessibilityState={{ selected }}
      style={[styles.pill, wrapStyle]}
    >
      <Text
        style={[
          styles.weekday,
          {
            color: day.isToday && !selected ? accent : theme.color.textMuted,
          },
        ]}
      >
        {day.weekdayShort}
      </Text>
      <Animated.View style={[styles.bubble, bubbleStyle]}>
        <Animated.Text style={[styles.dayNum, numStyle]}>{day.dayNum}</Animated.Text>
      </Animated.View>
      <View style={styles.dots}>
        {day.sports.slice(0, 3).map((s) => (
          <View key={s} style={[styles.dot, { backgroundColor: theme.sport[s] ?? accent }]} />
        ))}
        {day.sports.length === 0 ? <View style={styles.dotSpacer} /> : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    gap: 4,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: 6,
    borderRadius: radii.card,
  },
  weekday: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  bubble: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dayNum: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 999 },
  dotSpacer: { height: 5 },
});
