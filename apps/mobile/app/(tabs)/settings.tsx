import { useCallback, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  Chip,
  ErrorState,
  Screen,
  SettingsIcon,
  SettingsRow,
  SettingsSection,
  SettingsSurface,
  Skeleton,
  SportIcon,
  TeamCrest,
  providerLabelFromSession,
  type SportIconName,
} from '@/components';
import { haptics, radii, spacing, useTheme, type SportKey } from '@/design';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { registerPushDevice } from '@/lib/push';
import { useDevicePermission, devicePermissionLabel } from '@/lib/useDevicePermission';
import { links } from '@/lib/links';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Me = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  timezone: string;
  onboardingDone: boolean;
};

type Prefs = {
  id: string;
  channels: { push?: boolean; whatsapp?: boolean; telegram?: boolean } | Record<string, unknown>;
  briefTime: string;
  maxDailyPush: number;
  dndStart: string;
  dndEnd: string;
  preEventMins: number;
};

type SummaryEntity = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  logoUrl: string | null;
};

type SummarySport = {
  sportId: string;
  sportLabel: string;
  totals: { category: number; competition: number; team: number; player: number };
  competitions: SummaryEntity[];
  teams: SummaryEntity[];
  followsWholeSport: boolean;
};

type SubscriptionsSummary = {
  totalSubscriptions: number;
  sports: SummarySport[];
};

const SPORT_ICONS_MAP: Record<string, SportIconName> = {
  football: 'football',
  cricket: 'cricket',
  f1: 'f1',
  tennis: 'tennis',
  basketball: 'basketball',
  hockey: 'hockey',
  baseball: 'baseball',
};

const PRE_EVENT_OPTIONS = [15, 30, 60] as const;
const MAX_INLINE_CHIPS = 6;

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function SettingsScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const { status: devicePerm, refresh: refreshDevicePerm } = useDevicePermission();

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me') });
  const prefs = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: () => api<Prefs>('/api/me/preferences'),
  });
  const summary = useQuery({
    queryKey: ['subscriptions', 'summary'],
    queryFn: () => api<SubscriptionsSummary>('/api/subscriptions/summary'),
    staleTime: 30_000,
  });

  const patchPrefs = useMutation({
    mutationFn: (body: Partial<Prefs> & { channels?: Record<string, boolean> }) =>
      api<Prefs>('/api/me/preferences', { method: 'PATCH', json: body }),
    onSuccess: (data) => {
      qc.setQueryData(['me', 'preferences'], data);
      haptics.success();
    },
  });

  const onRefresh = useCallback(async () => {
    haptics.select();
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me'] }),
        qc.invalidateQueries({ queryKey: ['me', 'preferences'] }),
        qc.invalidateQueries({ queryKey: ['subscriptions', 'summary'] }),
        refreshDevicePerm(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc, refreshDevicePerm]);

  async function onEnableAlerts() {
    setPushLoading(true);
    setPushMessage(null);
    try {
      const result = await registerPushDevice({ requestPermission: true });
      await refreshDevicePerm();
      if (result.ok) {
        setPushMessage('Alerts enabled on this device.');
        patchPrefs.mutate({ channels: { push: true } });
      } else if (result.reason === 'denied') {
        setPushMessage('Notifications are off in system settings. Enable them, then try again.');
      } else {
        setPushMessage(result.message ?? 'Could not enable alerts.');
      }
    } finally {
      setPushLoading(false);
    }
  }

  const pushOn = Boolean(
    prefs.data?.channels &&
      typeof prefs.data.channels === 'object' &&
      (prefs.data.channels as { push?: boolean }).push !== false,
  );

  const loading = me.isPending || prefs.isPending;
  const errored = me.isError || prefs.isError;
  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const provider = providerLabelFromSession(session);
  const privacyUrl = links.privacy();
  const termsUrl = links.terms();
  const aboutUrl = links.about();
  const preEventMins = prefs.data?.preEventMins ?? 15;
  const quietNightsOn = isQuietNights(prefs.data);

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.color.accent}
            colors={[theme.color.accent]}
          />
        }
      >
        {/* ---------- Header ---------- */}
        <Animated.View entering={FadeInDown.duration(240)} style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.color.textFaint }]}>Account</Text>
          <Text style={[styles.title, { color: theme.color.text }]}>Settings</Text>
        </Animated.View>

        {loading ? (
          <View style={{ gap: spacing[3], paddingHorizontal: spacing[5], marginTop: spacing[5] }}>
            <Skeleton height={92} radius={radii.card} />
            <Skeleton height={200} radius={radii.card} />
            <Skeleton height={200} radius={radii.card} />
          </View>
        ) : errored ? (
          <ErrorState
            onRetry={() => {
              void me.refetch();
              void prefs.refetch();
              void summary.refetch();
            }}
          />
        ) : (
          <>
            {/* ==================== ACCOUNT ==================== */}
            <View style={styles.pad}>
              <AccountCard
                name={me.data?.name ?? session?.user.name ?? 'Signed in'}
                email={me.data?.email ?? session?.user.email ?? ''}
                image={me.data?.image ?? session?.user.image ?? null}
                timezone={me.data?.timezone ?? '—'}
                provider={provider}
                onOpen={() => router.push('/settings/account')}
              />
            </View>

            {/* ==================== YOUR FOLLOWS ==================== */}
            <View style={[styles.sectionWrap, { paddingHorizontal: spacing[5] }]}>
              <Text style={[styles.sectionEyebrow, { color: theme.color.textFaint }]}>
                YOUR FOLLOWS
              </Text>
              <FollowsSurface summary={summary.data} loading={summary.isLoading} />
            </View>

            <View style={[styles.pad, { marginTop: spacing[3] }]}>
              <SettingsSurface>
                <SettingsRow
                  icon="sliders"
                  title="Manage follows"
                  subtitle="Add or remove sports, competitions and teams"
                  onPress={() =>
                    router.push({
                      pathname: '/(onboarding)/sports',
                      params: { mode: 'manage' },
                    })
                  }
                  isLast
                />
              </SettingsSurface>
            </View>

            {/* ==================== ALERTS ==================== */}
            <SettingsSection title="Alerts">
              <SettingsRow
                icon="bell"
                title="Push notifications"
                subtitle="Nudge you before events you follow"
                trailing={
                  <Switch
                    value={pushOn}
                    onValueChange={(v) => {
                      haptics.select();
                      if (v) void onEnableAlerts();
                      else patchPrefs.mutate({ channels: { push: false } });
                    }}
                    trackColor={{ false: theme.color.border, true: theme.color.accentDim }}
                    thumbColor={pushOn ? theme.color.accent : theme.color.textMuted}
                  />
                }
              />
              <SettingsRow
                icon="lock"
                title="Device permission"
                subtitle={devicePermissionLabel(devicePerm)}
                onPress={
                  devicePerm === 'denied'
                    ? () => void Linking.openSettings()
                    : devicePerm === 'not_enabled'
                      ? () => void onEnableAlerts()
                      : devicePerm === 'granted'
                        ? () => void Linking.openSettings()
                        : undefined
                }
              />
              <SettingsRow
                icon="sliders"
                title="Remind me"
                subtitle="How long before an event?"
                bottomContent={
                  <View style={styles.chipRow}>
                    {PRE_EVENT_OPTIONS.map((mins) => (
                      <Chip
                        key={mins}
                        size="md"
                        label={mins >= 60 ? `${mins / 60} hr` : `${mins} min`}
                        selected={preEventMins === mins}
                        onPress={() => patchPrefs.mutate({ preEventMins: mins })}
                      />
                    ))}
                  </View>
                }
              />
              <SettingsRow
                icon="moon"
                title="Quiet nights"
                subtitle={
                  quietNightsOn && prefs.data
                    ? `Reminders paused ${prefs.data.dndStart} – ${prefs.data.dndEnd}`
                    : 'Pause reminders while sleeping'
                }
                trailing={
                  <Switch
                    value={quietNightsOn}
                    onValueChange={(v) => {
                      haptics.select();
                      patchPrefs.mutate(
                        v
                          ? { dndStart: '22:00', dndEnd: '07:00' }
                          : { dndStart: '00:00', dndEnd: '00:00' },
                      );
                    }}
                    trackColor={{ false: theme.color.border, true: theme.color.accentDim }}
                    thumbColor={quietNightsOn ? theme.color.accent : theme.color.textMuted}
                  />
                }
                isLast
              />
            </SettingsSection>

            {pushMessage || pushLoading ? (
              <View style={[styles.pad, { marginTop: spacing[2] }]}>
                <Text style={{ color: theme.color.textMuted, fontSize: 12 }}>
                  {pushLoading ? 'Enabling notifications…' : pushMessage}
                </Text>
              </View>
            ) : null}

            {/* ==================== SUPPORT ==================== */}
            <SettingsSection title="Support">
              <SettingsRow
                icon="message"
                title="Send feedback"
                subtitle="Tell us what could be better"
                onPress={() => router.push('/settings/feedback')}
              />
              <SettingsRow
                icon="warning"
                title="Report an issue"
                subtitle="Wrong score, time, logo or event"
                onPress={() => router.push('/settings/issue')}
              />
              <SettingsRow
                icon="help"
                title="Help & support"
                subtitle="Get help using Kairos"
                onPress={() => router.push('/settings/feedback')}
                isLast
              />
            </SettingsSection>

            {/* ==================== ABOUT ==================== */}
            <SettingsSection title="About">
              <SettingsRow
                icon="info"
                title="About Kairos"
                subtitle="Learn more about Kairos"
                onPress={aboutUrl ? () => void Linking.openURL(aboutUrl) : undefined}
                isLast={!privacyUrl && !termsUrl}
              />
              {privacyUrl ? (
                <SettingsRow
                  icon="lock"
                  title="Privacy Policy"
                  onPress={() => void Linking.openURL(privacyUrl)}
                  isLast={!termsUrl}
                />
              ) : null}
              {termsUrl ? (
                <SettingsRow
                  icon="info"
                  title="Terms of Service"
                  onPress={() => void Linking.openURL(termsUrl)}
                  isLast
                />
              ) : null}
            </SettingsSection>

            <View style={styles.footer}>
              <Text style={[styles.versionLine, { color: theme.color.textFaint }]}>
                Kairos · v{appVersion}
              </Text>
              <Text style={[styles.signature, { color: theme.color.textFaint }]}>
                Made for people who care about the game.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  Account card                                                              */
/* -------------------------------------------------------------------------- */

function AccountCard({
  name,
  email,
  image,
  timezone,
  provider,
  onOpen,
}: {
  name: string;
  email: string;
  image: string | null;
  timezone: string;
  provider: string | null;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const meta = [timezone, provider ? `Signed in with ${provider}` : null]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Account. ${name}. ${email}. Open account settings.`}
      onPress={() => {
        haptics.light();
        onOpen();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        accountStyles.card,
        {
          backgroundColor: pressed ? theme.color.surfacePressed : theme.color.surface,
          borderColor: theme.color.borderStrong,
        },
      ]}
    >
      <Avatar name={name} imageUrl={image} size={52} />
      <View style={accountStyles.body}>
        <Text style={[accountStyles.name, { color: theme.color.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[accountStyles.email, { color: theme.color.textMuted }]} numberOfLines={1}>
          {email}
        </Text>
        {meta ? (
          <Text style={[accountStyles.meta, { color: theme.color.textFaint }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <SettingsIcon name="chevron-right" color={theme.color.textFaint} size={18} />
    </Pressable>
  );
}

const accountStyles = StyleSheet.create({
  card: {
    marginTop: spacing[4],
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[4],
    paddingLeft: spacing[4],
    paddingRight: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: { flex: 1, minWidth: 0, marginLeft: spacing[3], marginRight: spacing[2], gap: 2 },
  name: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  email: { fontSize: 13 },
  meta: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginTop: 4 },
});

/* -------------------------------------------------------------------------- */
/*  Follows surface — ONE card, sport-grouped inside                          */
/* -------------------------------------------------------------------------- */

function FollowsSurface({
  summary,
  loading,
}: {
  summary: SubscriptionsSummary | undefined;
  loading: boolean;
}) {
  const theme = useTheme();

  if (loading) {
    return <Skeleton height={180} radius={radii.card} />;
  }

  if (!summary || summary.sports.length === 0) {
    return (
      <View
        style={[
          followsStyles.emptyCard,
          { backgroundColor: theme.color.surface, borderColor: theme.color.borderStrong },
        ]}
      >
        <Text style={[followsStyles.emptyTitle, { color: theme.color.text }]}>
          Nothing to follow yet
        </Text>
        <Text style={[followsStyles.emptyBody, { color: theme.color.textMuted }]}>
          Pick your sports, competitions and teams to personalise Today.
        </Text>
        <View style={{ marginTop: spacing[3] }}>
          <Button
            label="Set up your follows"
            size="md"
            onPress={() =>
              router.push({
                pathname: '/(onboarding)/sports',
                params: { mode: 'manage' },
              })
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        followsStyles.surface,
        { backgroundColor: theme.color.surface, borderColor: theme.color.borderStrong },
      ]}
    >
      {summary.sports.map((s, i) => (
        <View
          key={s.sportId}
          style={[
            i > 0 && {
              borderTopColor: theme.color.border,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <FollowsSportGroup sport={s} />
        </View>
      ))}
    </View>
  );
}

function FollowsSportGroup({ sport }: { sport: SummarySport }) {
  const theme = useTheme();
  const accent = theme.sport[sport.sportId as SportKey] ?? theme.color.accent;
  const iconName = SPORT_ICONS_MAP[sport.sportId] ?? 'default';
  const total = sport.totals.competition + sport.totals.team + sport.totals.player;
  const teamsShown = sport.teams.slice(0, MAX_INLINE_CHIPS);
  const teamsExtra = Math.max(0, sport.teams.length - MAX_INLINE_CHIPS);
  const compsShown = sport.competitions.slice(0, MAX_INLINE_CHIPS);
  const compsExtra = Math.max(0, sport.competitions.length - MAX_INLINE_CHIPS);

  return (
    <View style={followsStyles.groupInner}>
      <View style={followsStyles.groupHeader}>
        <View style={[followsStyles.sportIconWrap, { borderColor: withAlpha(accent, 0.4) }]}>
          <SportIcon name={iconName} size={14} color={accent} />
        </View>
        <Text style={[followsStyles.sportLabel, { color: theme.color.text }]}>
          {sport.sportLabel}
        </Text>
        <Text style={[followsStyles.sportMeta, { color: theme.color.textFaint }]}>
          {sport.followsWholeSport ? 'whole sport' : `${total} follow${total === 1 ? '' : 's'}`}
        </Text>
      </View>

      {sport.followsWholeSport ? null : (
        <View style={followsStyles.chipStack}>
          {compsShown.length > 0 ? (
            <View style={followsStyles.chipRow}>
              {compsShown.map((c) => (
                <FollowChip
                  key={`c:${c.id}`}
                  label={c.displayName ?? c.name ?? c.id}
                  logoUrl={c.logoUrl}
                  accent={accent}
                />
              ))}
              {compsExtra > 0 ? <MoreChip count={compsExtra} /> : null}
            </View>
          ) : null}
          {teamsShown.length > 0 ? (
            <View style={followsStyles.chipRow}>
              {teamsShown.map((t) => (
                <FollowChip
                  key={`t:${t.id}`}
                  label={t.name ?? t.id}
                  logoUrl={t.logoUrl}
                  accent={accent}
                />
              ))}
              {teamsExtra > 0 ? <MoreChip count={teamsExtra} /> : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function FollowChip({
  label,
  logoUrl,
  accent,
}: {
  label: string;
  logoUrl: string | null;
  accent: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        followsStyles.chip,
        { borderColor: withAlpha(accent, 0.32), backgroundColor: theme.color.bgSunken },
      ]}
    >
      <TeamCrest name={label} logoUrl={logoUrl} size={14} accentColor={null} />
      <Text style={[followsStyles.chipLabel, { color: theme.color.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MoreChip({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        followsStyles.moreChip,
        { borderColor: theme.color.border, backgroundColor: theme.color.bgSunken },
      ]}
    >
      <Text style={[followsStyles.moreChipLabel, { color: theme.color.textMuted }]}>
        +{count} more
      </Text>
    </View>
  );
}

const followsStyles = StyleSheet.create({
  surface: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  groupInner: {
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sportIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sportLabel: { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  sportMeta: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'lowercase' },
  chipStack: { marginTop: spacing[3] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 220,
    marginRight: 6,
    marginBottom: 6,
  },
  chipLabel: { fontSize: 12, fontWeight: '600', maxWidth: 180, marginLeft: 5 },
  moreChip: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  moreChipLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  emptyCard: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[4],
    alignItems: 'flex-start',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody: { fontSize: 12, marginTop: 4, lineHeight: 16 },
});

/* -------------------------------------------------------------------------- */

function withAlpha(hex: string, a: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function isQuietNights(prefs?: Prefs): boolean {
  if (!prefs) return false;
  return prefs.dndStart === '22:00' && prefs.dndEnd === '07:00';
}

const styles = StyleSheet.create({
  // Bottom padding = tab bar height (68) + safe area breathing room
  scroll: { paddingBottom: 68 + spacing[8] },
  header: { paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: spacing[1] },
  pad: { paddingHorizontal: spacing[5] },

  sectionWrap: { marginTop: spacing[6] },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: spacing[3],
    paddingHorizontal: spacing[1],
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], paddingBottom: 2 },

  footer: { marginTop: spacing[6], paddingHorizontal: spacing[5], alignItems: 'center' },
  versionLine: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  signature: { fontSize: 11, letterSpacing: 0.3, marginTop: spacing[1], opacity: 0.8 },
});
