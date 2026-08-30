import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { SportIcon, type SportIconName } from './SportIcon';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  eventId?: string | null;
  event?: {
    id: string;
    category: string;
    title: string;
    subtitle: string | null;
    startsAt: string;
    status: string;
    matchId?: string | null;
  } | null;
};

type Props = {
  item: NotificationItem;
  onPress?: () => void;
  onMarkRead?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Inbox row. No emojis — the leading indicator is a sport-tinted glyph
 * for the notification type ("pre-event" bell, "live" burst, "result"
 * flag, "digest" pages) rendered as SVG so it inherits accent colour.
 *
 * States:
 *   unread — filled dot in sport accent + subtle pulse; row full opacity
 *   read   — hollow dot; row fades to 65%
 *
 * Tapping marks read and (if a linked event exists) fires `onPress`,
 * which callers wire to the EventDetailSheet.
 */
export function NotificationRow({ item, onPress, onMarkRead }: Props) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const unread = !item.readAt;
  const sportKey = (item.event?.category ?? 'default') as SportKey;
  const accent = theme.sport[sportKey] ?? theme.color.accent;

  const dotFill = useSharedValue(unread ? 1 : 0);
  const readOpacity = useSharedValue(unread ? 1 : 0.65);
  const pulse = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    dotFill.value = withTiming(unread ? 1 : 0, {
      duration: reduce ? 0 : motion.duration.base,
    });
    readOpacity.value = withTiming(unread ? 1 : 0.65, {
      duration: reduce ? 0 : motion.duration.base,
    });
  }, [unread, reduce, dotFill, readOpacity]);

  // Subtle two-beat pulse on unread rows. Cheap — one shared value.
  useEffect(() => {
    if (!unread || reduce) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 900 }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, [unread, reduce, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      dotFill.value,
      [0, 1],
      ['transparent', accent],
    ),
    borderColor: interpolateColor(
      dotFill.value,
      [0, 1],
      [theme.color.border, accent],
    ),
    transform: [{ scale: 0.9 + 0.15 * dotFill.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: unread ? 0.35 * (2 - pulse.value) : 0,
    transform: [{ scale: pulse.value }],
    borderColor: accent,
  }));

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: readOpacity.value,
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    scale.value = withSpring(0.985, motion.spring.press);
  }, [scale]);
  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, motion.spring.press);
  }, [scale]);

  const handlePress = useCallback(() => {
    haptics.select();
    if (unread) onMarkRead?.();
    onPress?.();
  }, [unread, onMarkRead, onPress]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${item.body ?? ''}`}
      style={[
        styles.row,
        {
          backgroundColor: theme.color.surface,
          borderColor: unread ? withAlpha(accent, 0.4) : theme.color.border,
        },
        wrapStyle,
      ]}
    >
      <View style={styles.leading}>
        <View style={styles.dotStack}>
          <Animated.View style={[styles.pulseRing, pulseStyle]} />
          <Animated.View style={[styles.dot, dotStyle]} />
        </View>
        <View style={[styles.glyphWrap, { borderColor: withAlpha(accent, 0.4) }]}>
          <TypeGlyph type={item.type} sport={item.event?.category} color={accent} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              { color: theme.color.text, fontWeight: unread ? '700' : '600' },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[styles.time, { color: theme.color.textFaint }]}>
            {relTime(item.createdAt)}
          </Text>
        </View>
        {item.body ? (
          <Text style={[styles.subtitle, { color: theme.color.textMuted }]} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        {item.event ? (
          <View style={styles.contextRow}>
            <View style={[styles.contextDot, { backgroundColor: accent }]} />
            <Text style={[styles.context, { color: theme.color.textFaint }]} numberOfLines={1}>
              {formatContext(item)}
            </Text>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Type glyphs — minimal SVGs so they inherit sport accent                   */
/* -------------------------------------------------------------------------- */

function TypeGlyph({
  type,
  sport,
  color,
}: {
  type: string;
  sport?: string;
  color: string;
}) {
  // When we know the sport, show its icon — it reads as "this is football".
  // Falls back to the type glyph for digests / unknown events.
  if (sport && SPORT_ICON_MAP[sport]) {
    return <SportIcon name={SPORT_ICON_MAP[sport]} size={16} color={color} />;
  }
  switch (type) {
    case 'pre_event':
      return <BellIcon color={color} />;
    case 'live_start':
      return <BurstIcon color={color} />;
    case 'result':
      return <FlagIcon color={color} />;
    case 'digest':
      return <PagesIcon color={color} />;
    default:
      return <DotIcon color={color} />;
  }
}

const SPORT_ICON_MAP: Record<string, SportIconName> = {
  football: 'football',
  cricket: 'cricket',
  f1: 'f1',
  tennis: 'tennis',
  basketball: 'basketball',
  hockey: 'hockey',
  baseball: 'baseball',
};

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path
        d="M4 11h8M6.5 11a1.5 1.5 0 003 0M4 11V7.5a4 4 0 018 0V11"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BurstIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M8 3v2M8 11v2M3 8h2M11 8h2M4.5 4.5l1.4 1.4M10.1 10.1l1.4 1.4M4.5 11.5l1.4-1.4M10.1 5.9l1.4-1.4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M8 6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" fill={color} />
    </Svg>
  );
}

function FlagIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M4 3v10" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M4 3.5h6.5l-1 2 1 2H4" stroke={color} strokeWidth={1.5} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function PagesIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M3.5 4h6l2 2v6h-8V4z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M5.5 7h4M5.5 9.5h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function DotIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path d="M8 6a2 2 0 100 4 2 2 0 000-4z" fill={color} />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatContext(item: NotificationItem): string {
  const ev = item.event;
  if (!ev) return '';
  const when = new Date(ev.startsAt);
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const bits = [ev.subtitle ?? ev.title, time].filter(Boolean);
  return bits.join('  ·  ');
}

function relTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  leading: {
    width: 40,
    alignItems: 'center',
    gap: spacing[2],
  },
  dotStack: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  glyphWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 15, letterSpacing: -0.1 },
  time: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  contextDot: { width: 4, height: 4, borderRadius: 999 },
  context: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
});
