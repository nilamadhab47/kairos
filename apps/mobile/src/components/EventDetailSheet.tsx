import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Countdown } from './Countdown';
import { StatusPill, type MatchState } from './StatusPill';
import { TeamCrest } from './TeamCrest';
import type { TodayEvent } from './EventCard';
import { elevation, haptics, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import { formatLocalTime } from '@/lib/time';
import { effectiveMatchStatus } from '@kairo/core';

type Openable = TodayEvent & { isStarred?: boolean };

type Ctx = {
  openEvent: (event: Openable, timezone?: string) => void;
  close: () => void;
};

const EventDetailContext = createContext<Ctx | null>(null);

export function useEventDetail(): Ctx {
  const ctx = useContext(EventDetailContext);
  if (!ctx) throw new Error('useEventDetail must be used within EventDetailProvider');
  return ctx;
}

export function EventDetailProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [event, setEvent] = useState<Openable | null>(null);
  const [timezone, setTimezone] = useState<string | undefined>();
  const qc = useQueryClient();

  const openEvent = useCallback((ev: Openable, tz?: string) => {
    setEvent(ev);
    setTimezone(tz);
    haptics.select();
    // present on next tick so state is painted before the sheet mounts content
    requestAnimationFrame(() => sheetRef.current?.present());
  }, []);

  const close = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  const star = useMutation({
    mutationFn: (id: string) =>
      api<{ isStarred: boolean }>(`/api/events/${id}/star`, { method: 'POST' }),
    onMutate: async (id) => {
      setEvent((prev) => (prev && prev.id === id ? { ...prev, isStarred: !prev.isStarred } : prev));
    },
    onSuccess: (data, id) => {
      setEvent((prev) => (prev && prev.id === id ? { ...prev, isStarred: data.isStarred } : prev));
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (_e, id) => {
      // roll back optimistic flip
      setEvent((prev) => (prev && prev.id === id ? { ...prev, isStarred: !prev.isStarred } : prev));
    },
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/api/events/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] });
      close();
    },
  });

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} />
    ),
    [],
  );

  const value = useMemo(() => ({ openEvent, close }), [openEvent, close]);

  return (
    <EventDetailContext.Provider value={value}>
      {children}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['62%', '88%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: theme.color.bgElevated,
          borderTopLeftRadius: radii.sheet,
          borderTopRightRadius: radii.sheet,
          ...elevation.sheet,
        }}
        handleIndicatorStyle={{ backgroundColor: theme.color.borderStrong, width: 40 }}
        onDismiss={() => setEvent(null)}
      >
        {event ? (
          <SheetBody
            event={event}
            timezone={timezone}
            onStar={() => {
              haptics.medium();
              star.mutate(event.id);
            }}
            onDismissFromToday={() => {
              haptics.warning();
              dismiss.mutate(event.id);
            }}
            starring={star.isPending}
            dismissing={dismiss.isPending}
          />
        ) : null}
      </BottomSheetModal>
    </EventDetailContext.Provider>
  );
}

function SheetBody({
  event,
  timezone,
  onStar,
  onDismissFromToday,
  starring,
  dismissing,
}: {
  event: Openable;
  timezone?: string;
  onStar: () => void;
  onDismissFromToday: () => void;
  starring: boolean;
  dismissing: boolean;
}) {
  const theme = useTheme();
  const sportKey = event.category as SportKey;
  const accent = theme.sport[sportKey] ?? theme.color.accent;
  const state = mapStatus(event.status, event.startsAt, event.category);
  const meta = (event.metadata ?? {}) as Record<string, any>;
  const isMatch = Boolean(meta.homeTeam?.name && meta.awayTeam?.name && event.category !== 'f1');
  const time = formatLocalTime(event.startsAt, timezone);
  let dateLabel = '';
  try {
    dateLabel = new Date(event.startsAt).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    });
  } catch {
    dateLabel = event.startsAt;
  }
  const matchId =
    typeof meta.matchId === 'string' && meta.matchId.length > 0
      ? meta.matchId
      : isMatch
        ? event.id
        : null;
  const showMoments = Boolean(matchId) && isMatch && (state === 'ft' || state === 'live');
  const detail = useQuery({
    queryKey: ['match-detail', matchId],
    queryFn: () =>
      api<{
        match: {
          score?: { home: number | null; away: number | null };
          events?: MatchMoment[];
        };
      }>(`/api/matches/${matchId}`),
    enabled: showMoments,
    retry: false,
    refetchInterval: state === 'live' ? 60_000 : false,
  });
  const score = detail.data?.match.score ?? meta.score;
  const moments = (detail.data?.match.events ?? []).filter((e) =>
    ['goal', 'card', 'substitution', 'penalty', 'var'].includes(e.type),
  );

  return (
    <BottomSheetScrollView contentContainerStyle={styles.content}>
      <View style={[styles.stripe, { backgroundColor: accent }]} />

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
        <View style={styles.match}>
          <View style={styles.teamCol}>
            <TeamCrest
              name={meta.homeTeam.name}
              logoUrl={meta.homeTeam.logoUrl}
              size={64}
              accentColor={accent}
            />
            <Text style={[styles.teamName, { color: theme.color.text }]} numberOfLines={2}>
              {meta.homeTeam.name}
            </Text>
          </View>
          <View style={styles.vsCol}>
            {score && (score.home != null || score.away != null) ? (
              <Text style={[styles.score, { color: theme.color.text }]}>
                {score.home ?? 0}
                <Text style={{ color: theme.color.textFaint }}> – </Text>
                {score.away ?? 0}
              </Text>
            ) : (
              <Text style={[styles.vs, { color: theme.color.textFaint }]}>VS</Text>
            )}
          </View>
          <View style={styles.teamCol}>
            <TeamCrest
              name={meta.awayTeam.name}
              logoUrl={meta.awayTeam.logoUrl}
              size={64}
              accentColor={accent}
            />
            <Text style={[styles.teamName, { color: theme.color.text }]} numberOfLines={2}>
              {meta.awayTeam.name}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.title, { color: theme.color.text }]}>{event.title}</Text>
      )}

      {state === 'live' ? (
        <View style={[styles.liveBanner, { backgroundColor: 'rgba(52,211,153,0.12)' }]}>
          <Text style={{ color: theme.color.live, fontWeight: '800', letterSpacing: 1.2, fontSize: 13 }}>
            LIVE NOW
          </Text>
        </View>
      ) : state === 'ft' ? null : (
        <View style={styles.countdownBlock}>
          <Text style={[styles.countdownLabel, { color: theme.color.textFaint }]}>STARTS IN</Text>
          <Countdown startsAt={event.startsAt} variant="clock" soonAccent={accent} size="lg" />
        </View>
      )}

      <View style={[styles.metaCard, { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border }]}>
        <MetaRow label="When" value={`${dateLabel} · ${time}`} />
        {meta.venue ? <MetaRow label="Venue" value={String(meta.venue)} /> : null}
        {meta.round ? <MetaRow label="Round" value={String(meta.round)} /> : null}
        {meta.provider ? <MetaRow label="Source" value={String(meta.provider)} /> : null}
      </View>

      {showMoments && moments.length > 0 ? (
        <View
          style={[
            styles.metaCard,
            { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border, marginTop: spacing[4] },
          ]}
        >
          <Text style={[styles.countdownLabel, { color: theme.color.textFaint, marginBottom: spacing[1] }]}>
            KEY MOMENTS
          </Text>
          {moments.map((m) => (
            <View key={m.id} style={styles.momentRow}>
              <Text style={[styles.momentMin, { color: theme.color.textFaint }]}>
                {m.minute != null ? `${m.minute}'` : '—'}
              </Text>
              <Text style={styles.momentIcon}>{momentGlyph(m)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.momentPlayer, { color: theme.color.text }]} numberOfLines={1}>
                  {m.playerName ?? momentFallback(m.type)}
                </Text>
                <Text style={[styles.momentMeta, { color: theme.color.textMuted }]} numberOfLines={1}>
                  {[
                    m.team === 'away' ? meta.awayTeam?.name : meta.homeTeam?.name,
                    momentLabel(m),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onStar}
          disabled={starring}
          accessibilityRole="button"
          accessibilityLabel={event.isStarred ? 'Unstar event' : 'Star event'}
          style={[
            styles.actionBtn,
            {
              backgroundColor: event.isStarred ? withAlpha(accent, 0.18) : theme.color.bgSunken,
              borderColor: event.isStarred ? withAlpha(accent, 0.5) : theme.color.border,
            },
          ]}
        >
          <Text style={{ fontSize: 18 }}>{event.isStarred ? '★' : '☆'}</Text>
          <Text style={{ color: theme.color.text, fontWeight: '600', fontSize: 14 }}>
            {event.isStarred ? 'Starred' : 'Star'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDismissFromToday}
          disabled={dismissing}
          accessibilityRole="button"
          accessibilityLabel="Hide from Today"
          style={[
            styles.actionBtn,
            { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border },
          ]}
        >
          <Text style={{ fontSize: 16 }}>✕</Text>
          <Text style={{ color: theme.color.textMuted, fontWeight: '600', fontSize: 14 }}>
            Hide today
          </Text>
        </Pressable>
      </View>
    </BottomSheetScrollView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: theme.color.textFaint }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: theme.color.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

type MatchMoment = {
  id: string;
  minute: number | null;
  type: string;
  team: string | null;
  playerName: string | null;
  detail: string | null;
};

function momentGlyph(m: MatchMoment): string {
  if (m.type === 'goal') return '⚽';
  if (m.type === 'penalty') return m.detail?.toLowerCase().includes('miss') ? '❌' : '⚽';
  if (m.type === 'substitution') return '🔄';
  if (m.type === 'var') return '📺';
  if (m.type === 'card') {
    return m.detail?.toLowerCase().includes('red') ? '🟥' : '🟨';
  }
  return '•';
}

function momentLabel(m: MatchMoment): string | null {
  if (m.type === 'goal') return m.detail?.toLowerCase().includes('own') ? 'Own goal' : null;
  if (m.type === 'penalty') return m.detail ?? 'Penalty';
  if (m.type === 'card') return m.detail ?? 'Card';
  if (m.type === 'substitution') return 'Sub';
  if (m.type === 'var') return 'VAR';
  return m.detail;
}

function momentFallback(type: string): string {
  switch (type) {
    case 'goal':
      return 'Goal';
    case 'penalty':
      return 'Penalty';
    case 'card':
      return 'Card';
    case 'substitution':
      return 'Substitution';
    default:
      return type;
  }
}

function mapStatus(s: string, startsAt?: string, sportId?: string): MatchState {
  const effective = effectiveMatchStatus(s, startsAt ?? Date.now(), sportId);
  if (effective === 'live') return 'live';
  if (effective === 'completed') return 'ft';
  if (effective === 'postponed') return 'postponed';
  if (effective === 'cancelled') return 'cancelled';
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
  content: { paddingHorizontal: spacing[5], paddingBottom: spacing[12] },
  stripe: {
    height: 3,
    borderRadius: 999,
    width: 48,
    alignSelf: 'center',
    marginBottom: spacing[4],
    opacity: 0.9,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  chipDot: { width: 6, height: 6, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[6],
    marginBottom: spacing[4],
  },
  teamCol: { flex: 1, alignItems: 'center', gap: spacing[2] },
  vsCol: { paddingHorizontal: spacing[3] },
  teamName: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  score: { fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.6 },
  vs: { fontSize: 18, fontWeight: '700', letterSpacing: 1.4 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: spacing[5],
    marginBottom: spacing[3],
  },
  liveBanner: {
    alignSelf: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.pill,
    marginVertical: spacing[4],
  },
  countdownBlock: { alignItems: 'center', gap: spacing[2], marginVertical: spacing[5] },
  countdownLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  metaCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    padding: spacing[4],
    gap: spacing[3],
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[4] },
  metaLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3, minWidth: 56 },
  metaValue: { flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  momentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: 6,
  },
  momentMin: { width: 36, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  momentIcon: { fontSize: 14, width: 22, textAlign: 'center' },
  momentPlayer: { fontSize: 14, fontWeight: '600' },
  momentMeta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[5],
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 48,
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
