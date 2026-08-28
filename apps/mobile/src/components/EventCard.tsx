import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { Countdown } from './Countdown';
import { StatusPill, type MatchState } from './StatusPill';
import { TeamCrest } from './TeamCrest';
import { formatLocalTime } from '@/lib/time';
import { radii, spacing, useTheme, type SportKey } from '@/design';

export type TodayEvent = {
  id: string;
  category: string;
  title: string;
  subtitle: string | null;
  startsAt: string;
  status: string;
  metadata: Record<string, unknown> | null;
  isStarred?: boolean;
  isDismissed?: boolean;
};

type Props = {
  event: TodayEvent;
  variant?: 'default' | 'hero';
  timezone?: string;
  onPress?: () => void;
};

/**
 * Universal event card. Adapts to sport category — matches show crests,
 * F1 sessions show a session pill. Hero variant is larger and includes
 * a live countdown clock or a soon-accented phrase.
 */
export function EventCard({ event, variant = 'default', timezone, onPress }: Props) {
  const theme = useTheme();
  const sportKey = event.category as SportKey;
  const accent = theme.sport[sportKey] ?? theme.color.accent;
  const state = mapStatus(event.status);
  const time = formatLocalTime(event.startsAt, timezone);
  const meta = (event.metadata ?? {}) as Record<string, any>;
  const isMatch =
    meta.homeTeam?.name && meta.awayTeam?.name && event.category !== 'f1';

  const isHero = variant === 'hero';

  return (
    <Card onPress={onPress} padded={false} style={{ borderColor: withAlpha(accent, 0.35) }}>
      <View
        style={[
          styles.accentStripe,
          { backgroundColor: accent, height: isHero ? 4 : 3 },
        ]}
      />
      <View style={{ padding: isHero ? spacing[5] : spacing[4] }}>
        <View style={styles.topRow}>
          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: accent }]} />
            <Text style={[styles.chipText, { color: theme.color.textMuted }]}>
              {sportLabel(event.category)}
              {event.subtitle ? `  ·  ${event.subtitle}` : ''}
            </Text>
          </View>
          <StatusPill state={state} />
        </View>

        {isMatch ? (
          <MatchBody
            home={meta.homeTeam}
            away={meta.awayTeam}
            score={meta.score}
            accent={accent}
            hero={isHero}
          />
        ) : (
          <GenericBody title={event.title} hero={isHero} />
        )}

        <View style={styles.bottomRow}>
          <Text
            style={[styles.timeText, { color: theme.color.textFaint, flex: 1, marginRight: spacing[3] }]}
            numberOfLines={1}
          >
            {time}
            {meta.venue ? `  ·  ${meta.venue}` : ''}
          </Text>
          {state === 'live' ? (
            <Text style={{ color: theme.color.live, fontWeight: '700', fontSize: 12, letterSpacing: 1 }}>
              ON AIR
            </Text>
          ) : state === 'ft' ? null : (
            <Countdown
              startsAt={event.startsAt}
              variant={isHero ? 'clock' : 'phrase'}
              soonAccent={accent}
              size={isHero ? 'lg' : 'sm'}
            />
          )}
        </View>
      </View>
    </Card>
  );
}

function MatchBody({
  home,
  away,
  score,
  accent,
  hero,
}: {
  home: { name: string; logoUrl?: string | null };
  away: { name: string; logoUrl?: string | null };
  score?: { home?: number | null; away?: number | null } | null;
  accent: string;
  hero: boolean;
}) {
  const theme = useTheme();
  const crestSize = hero ? 52 : 40;
  const nameSize = hero ? 18 : 15;
  const scoreSize = hero ? 34 : 22;
  const hasScore = score && (score.home != null || score.away != null);

  return (
    <View style={[styles.matchWrap, { marginTop: hero ? spacing[5] : spacing[4] }]}>
      <View style={styles.teamCol}>
        <TeamCrest name={home.name} logoUrl={home.logoUrl ?? undefined} size={crestSize} accentColor={accent} />
        <Text
          style={[styles.teamName, { color: theme.color.text, fontSize: nameSize }]}
          numberOfLines={1}
        >
          {home.name}
        </Text>
      </View>

      <View style={styles.centerCol}>
        {hasScore ? (
          <Text
            style={{
              color: theme.color.text,
              fontSize: scoreSize,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.5,
            }}
          >
            {score?.home ?? 0}
            <Text style={{ color: theme.color.textFaint }}> – </Text>
            {score?.away ?? 0}
          </Text>
        ) : (
          <Text
            style={{
              color: theme.color.textFaint,
              fontSize: hero ? 20 : 14,
              fontWeight: '700',
              letterSpacing: 1,
            }}
          >
            VS
          </Text>
        )}
      </View>

      <View style={styles.teamCol}>
        <TeamCrest name={away.name} logoUrl={away.logoUrl ?? undefined} size={crestSize} accentColor={accent} />
        <Text
          style={[styles.teamName, { color: theme.color.text, fontSize: nameSize }]}
          numberOfLines={1}
        >
          {away.name}
        </Text>
      </View>
    </View>
  );
}

function GenericBody({ title, hero }: { title: string; hero: boolean }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.color.text,
        fontSize: hero ? 24 : 18,
        fontWeight: '700',
        letterSpacing: -0.3,
        marginTop: hero ? spacing[5] : spacing[3],
      }}
      numberOfLines={2}
    >
      {title}
    </Text>
  );
}

function mapStatus(s: string): MatchState {
  if (s === 'live') return 'live';
  if (s === 'ft' || s === 'finished' || s === 'complete' || s === 'completed') return 'ft';
  if (s === 'postponed') return 'postponed';
  if (s === 'cancelled') return 'cancelled';
  return 'upcoming';
}

function sportLabel(id: string): string {
  switch (id) {
    case 'f1':
      return 'F1';
    case 'football':
      return 'FOOTBALL';
    case 'cricket':
      return 'CRICKET';
    case 'tennis':
      return 'TENNIS';
    default:
      return id.toUpperCase();
  }
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
  accentStripe: { width: '100%', borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  chipDot: { width: 6, height: 6, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  matchWrap: { flexDirection: 'row', alignItems: 'center' },
  teamCol: { flex: 1, alignItems: 'center', gap: 8 },
  centerCol: { paddingHorizontal: spacing[3] },
  teamName: { fontWeight: '600', textAlign: 'center', maxWidth: 120 },
  bottomRow: {
    marginTop: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
});
