import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haptics, radii, spacing, useTheme, type SportKey } from '@/design';
import { TeamCrest } from './TeamCrest';
import type { FeedMatch } from '@/lib/feed';

/**
 * Calendar-optimised event row — an order of magnitude denser than
 * `EventCard`. Time on the left, matchup in the middle, status on the
 * right. Scannable in under a second even in a long day-grouped list.
 *
 * Never renders "0-0" for a scheduled match; the score column is only
 * shown when the backend has said the match is live or completed.
 */
export const CalendarEventRow = memo(function CalendarEventRow({
  match,
  timezone,
  onPress,
}: {
  match: FeedMatch;
  timezone: string | undefined;
  onPress?: (m: FeedMatch) => void;
}) {
  const theme = useTheme();
  const accent = theme.sport[match.sportId as SportKey] ?? theme.color.accent;
  const timeLabel = formatTime(match.startsAt, timezone);
  const status = normalizeStatus(match.status);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.light();
        onPress?.(match);
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.color.bgSunken : theme.color.bgElevated,
          borderColor: theme.color.border,
        },
      ]}
    >
      {/* Left: time / status */}
      <View style={styles.left}>
        {status === 'live' ? (
          <View style={styles.livePill}>
            <View style={[styles.liveDot, { backgroundColor: theme.color.live }]} />
            <Text style={[styles.liveText, { color: theme.color.live }]}>LIVE</Text>
          </View>
        ) : status === 'final' ? (
          <Text style={[styles.finalText, { color: theme.color.textMuted }]}>FT</Text>
        ) : status === 'postponed' ? (
          <Text style={[styles.finalText, { color: theme.color.textMuted }]}>PPD</Text>
        ) : (
          <Text
            style={[styles.timeText, { color: theme.color.text }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {timeLabel}
          </Text>
        )}
      </View>

      {/* Middle: matchup + competition context */}
      <View style={styles.middle}>
        {match.homeTeam && match.awayTeam ? (
          <>
            <View style={styles.teamLine}>
              <TeamCrest
                name={match.homeTeam.name}
                logoUrl={match.homeTeam.logoUrl}
                size={18}
                accentColor={null}
              />
              <Text
                style={[styles.teamName, { color: theme.color.text }]}
                numberOfLines={1}
              >
                {match.homeTeam.name}
              </Text>
              {status !== 'scheduled' &&
              match.score.home !== null &&
              match.score.away !== null ? (
                <Text style={[styles.scoreCell, { color: theme.color.text }]}>
                  {match.score.home}
                </Text>
              ) : null}
            </View>
            <View style={styles.teamLine}>
              <TeamCrest
                name={match.awayTeam.name}
                logoUrl={match.awayTeam.logoUrl}
                size={18}
                accentColor={null}
              />
              <Text
                style={[styles.teamName, { color: theme.color.text }]}
                numberOfLines={1}
              >
                {match.awayTeam.name}
              </Text>
              {status !== 'scheduled' &&
              match.score.home !== null &&
              match.score.away !== null ? (
                <Text style={[styles.scoreCell, { color: theme.color.text }]}>
                  {match.score.away}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={[styles.singleTitle, { color: theme.color.text }]} numberOfLines={2}>
            {match.competition.label}
            {match.round ? ` · ${match.round}` : ''}
          </Text>
        )}
        <Text
          style={[styles.compLine, { color: theme.color.textMuted }]}
          numberOfLines={1}
        >
          <Text style={{ color: accent, fontWeight: '700', letterSpacing: 0.4 }}>
            {sportShort(match.sportId)}
          </Text>
          {'  ·  '}
          {match.competition.label}
          {match.round && match.homeTeam && match.awayTeam ? `  ·  ${match.round}` : ''}
        </Text>
      </View>
    </Pressable>
  );
});

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */

function normalizeStatus(raw: string): 'scheduled' | 'live' | 'final' | 'postponed' {
  const s = (raw ?? '').toLowerCase();
  if (s === 'live' || s === 'in_progress' || s === 'ongoing') return 'live';
  if (s === 'final' || s === 'finished' || s === 'completed' || s === 'ended' || s === 'ft')
    return 'final';
  if (s === 'postponed' || s === 'suspended' || s === 'abandoned') return 'postponed';
  return 'scheduled';
}

function formatTime(iso: string, tz: string | undefined): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
  } catch {
    return '';
  }
}

function sportShort(sportId: string): string {
  const map: Record<string, string> = {
    football: 'FOOTBALL',
    cricket: 'CRICKET',
    f1: 'F1',
    tennis: 'TENNIS',
    basketball: 'BASKETBALL',
    hockey: 'HOCKEY',
    baseball: 'BASEBALL',
  };
  return map[sportId] ?? sportId.toUpperCase();
}

/* -------------------------------------------------------------------------- */
/*  styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  left: {
    // Wide enough for "12:30 AM" without wrapping "AM" onto the next line
    // — the previous 58pt slot was the source of the "12:30 A / M" bug.
    minWidth: 74,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 999 },
  liveText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  finalText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  middle: {
    flex: 1,
    gap: 4,
  },
  teamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  teamName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  scoreCell: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 18,
    textAlign: 'right',
  },
  singleTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  compLine: {
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
