import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { KairosMark, KairosWordmark, SettingsIcon, SportIcon, type SportIconName } from '@/components';
import { haptics, motion, radii, spacing, useTheme, type SportKey } from '@/design';

/* -------------------------------------------------------------------------- */
/*  Manage-follows mode                                                       */
/* -------------------------------------------------------------------------- */

export type FollowsSummaryEntity = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  logoUrl: string | null;
};

export type FollowsSummarySport = {
  sportId: string;
  sportLabel: string;
  totals: { category: number; competition: number; team: number; player: number };
  competitions: FollowsSummaryEntity[];
  teams: FollowsSummaryEntity[];
  followsWholeSport: boolean;
};

export type FollowsSummary = {
  totalSubscriptions: number;
  sports: FollowsSummarySport[];
};

export function isManageMode(mode?: string | string[]): boolean {
  const value = Array.isArray(mode) ? mode[0] : mode;
  return value === 'manage';
}

/** Pass through the manage flag on every hop of the edit-follows stack. */
export function manageParams(mode?: string | string[]): { mode?: string } {
  return isManageMode(mode) ? { mode: 'manage' } : {};
}

/**
 * Put selected items first. Optionally merge in extras (e.g. already-followed
 * comps/teams that aren't in the current catalog page) so they stay visible.
 */
export function pinSelectedFirst<T extends { id: string }>(
  items: T[],
  selectedIds: Set<string> | undefined,
  extras: T[] = [],
): T[] {
  if (!selectedIds || selectedIds.size === 0) {
    if (extras.length === 0) return items;
  }
  const selected = selectedIds ?? new Set<string>();
  const seen = new Set<string>();
  const top: T[] = [];
  const rest: T[] = [];

  for (const item of extras) {
    if (!selected.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    top.push(item);
  }
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (selected.has(item.id)) top.push(item);
    else rest.push(item);
  }
  return [...top, ...rest];
}

export function sportIdsFromSummary(summary?: FollowsSummary | null): string[] {
  return summary?.sports.map((s) => s.sportId) ?? [];
}

export function compsBySportFromSummary(
  summary?: FollowsSummary | null,
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const s of summary?.sports ?? []) {
    out[s.sportId] = new Set(s.competitions.map((c) => c.id));
  }
  return out;
}

export function teamsBySportFromSummary(
  summary?: FollowsSummary | null,
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const s of summary?.sports ?? []) {
    out[s.sportId] = new Set(s.teams.map((t) => t.id));
  }
  return out;
}

/**
 * Top bar for onboarding / manage-follows screens.
 * In manage mode (or whenever `showBack` is true) shows a back control so
 * the user can bail without losing their way.
 */
export function OnboardingTopBar({
  showBack,
  onBack,
  paddingTop,
}: {
  showBack?: boolean;
  onBack?: () => void;
  paddingTop: number;
}) {
  const theme = useTheme();
  const handleBack = () => {
    haptics.light();
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/settings');
  };

  return (
    <View style={[topBarStyles.header, { paddingTop }]}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={handleBack}
          style={topBarStyles.backBtn}
        >
          <SettingsIcon name="chevron-left" color={theme.color.text} size={22} />
        </Pressable>
      ) : (
        <View style={topBarStyles.backBtn} />
      )}
      <View style={topBarStyles.brand}>
        <KairosMark size={22} color={theme.color.accent} />
        <KairosWordmark width={74} color={theme.color.accent} strokeWidth={12} />
      </View>
      <View style={topBarStyles.backBtn} />
    </View>
  );
}

const topBarStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
});

export const SPORT_LABELS: Record<string, string> = {
  f1: 'Formula 1',
  football: 'Football',
  cricket: 'Cricket',
  tennis: 'Tennis',
  basketball: 'Basketball',
  hockey: 'Ice Hockey',
  baseball: 'Baseball',
};

export const SPORT_ICONS: Record<string, SportIconName> = {
  football: 'football',
  cricket: 'cricket',
  f1: 'f1',
  tennis: 'tennis',
  basketball: 'basketball',
  hockey: 'hockey',
  baseball: 'baseball',
};

/**
 * Horizontal sport tab bar for the personalisation flow. Preserves
 * per-sport accent colouring — the active pill lights up with the
 * sport's brand hue instead of the global teal so context is obvious.
 */
export function SportPillBar({
  sports,
  active,
  onChange,
  badgeCount,
}: {
  sports: string[];
  active: string;
  onChange: (id: string) => void;
  badgeCount?: (id: string) => number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.bar}
    >
      {sports.map((id) => (
        <SportPill
          key={id}
          id={id}
          label={SPORT_LABELS[id] ?? id}
          iconName={SPORT_ICONS[id] ?? 'default'}
          active={id === active}
          count={badgeCount?.(id) ?? 0}
          onPress={() => onChange(id)}
        />
      ))}
    </ScrollView>
  );
}

function SportPill({
  id,
  label,
  iconName,
  active,
  count,
  onPress,
}: {
  id: string;
  label: string;
  iconName: SportIconName;
  active: boolean;
  count: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const accent = theme.sport[id as SportKey] ?? theme.color.accent;
  const highlight = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    highlight.value = withTiming(active ? 1 : 0, { duration: motion.duration.fast });
  }, [active, highlight]);

  const bgOff = theme.color.bgElevated;
  const bgOn = withAlpha(accent, 0.14);
  const borderOff = theme.color.border;
  const borderOn = withAlpha(accent, 0.55);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(highlight.value, [0, 1], [bgOff, bgOn]),
    borderColor: interpolateColor(highlight.value, [0, 1], [borderOff, borderOn]),
  }));

  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Animated.View style={[styles.pill, style]}>
        <SportIcon name={iconName} size={16} color={active ? accent : theme.color.textMuted} />
        <Text
          style={{
            color: active ? theme.color.text : theme.color.textMuted,
            fontSize: 13,
            fontWeight: '600',
            letterSpacing: 0.1,
          }}
        >
          {label}
        </Text>
        {count > 0 ? (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Text style={{ color: theme.color.onAccent, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
              {count}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
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

/**
 * Decode "sportId:compA|compB,sportId2:compC" into `{ [sportId]: Set<compId> }`.
 * Empty buckets are preserved so a sport with no picks is still known.
 */
export function decodeSelections(encoded?: string): Record<string, Set<string>> {
  if (!encoded) return {};
  const out: Record<string, Set<string>> = {};
  for (const chunk of encoded.split(',')) {
    if (!chunk.includes(':')) continue;
    const [sid, list] = chunk.split(':');
    if (!sid) continue;
    out[sid] = new Set(list ? list.split('|').filter(Boolean) : []);
  }
  return out;
}

/**
 * Compact inline search input tuned for the onboarding pickers.
 * Full-width, rounded, subdued placeholder — matches the picker rows.
 */
export function SearchInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        searchStyles.wrap,
        {
          backgroundColor: theme.color.bgElevated,
          borderColor: theme.color.border,
        },
      ]}
    >
      <SearchGlyph color={theme.color.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        style={[searchStyles.input, { color: theme.color.text }]}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={12}
          accessibilityLabel="Clear search"
        >
          <Text style={{ color: theme.color.textMuted, fontSize: 14 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SearchGlyph({ color }: { color: string }) {
  return (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 11,
          height: 11,
          borderRadius: 999,
          borderWidth: 1.4,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          bottom: 1,
          width: 5,
          height: 1.4,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

const searchStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    height: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
});

export function encodeSelections(map: Record<string, Set<string>>): string {
  return Object.entries(map)
    .map(([sid, set]) => `${sid}:${[...set].join('|')}`)
    .join(',');
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing[5],
    gap: spacing[2],
  },
  pill: {
    height: 36,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
