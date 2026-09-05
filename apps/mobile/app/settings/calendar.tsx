import { useCallback } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Screen, SettingsIcon } from '@/components';
import { haptics, radii, spacing, useTheme } from '@/design';
import { api } from '@/lib/api';

type FeedStatus =
  | { connected: false }
  | { connected: true; icsUrl: string; webcalUrl: string; googleUrl: string };

export default function CalendarSyncScreen() {
  const theme = useTheme();
  const qc = useQueryClient();

  const feed = useQuery({
    queryKey: ['me', 'calendar-feed'],
    queryFn: () => api<FeedStatus>('/api/me/calendar-feed'),
  });

  const enable = useMutation({
    mutationFn: () => api<FeedStatus>('/api/me/calendar-feed', { method: 'POST' }),
    onSuccess: (data) => {
      haptics.success();
      qc.setQueryData(['me', 'calendar-feed'], data);
    },
    onError: () => haptics.error(),
  });

  const disable = useMutation({
    mutationFn: () => api<FeedStatus>('/api/me/calendar-feed', { method: 'DELETE' }),
    onSuccess: (data) => {
      haptics.light();
      qc.setQueryData(['me', 'calendar-feed'], data);
    },
  });

  const connected = feed.data && feed.data.connected ? feed.data : null;

  const onCopy = useCallback((url: string) => {
    haptics.light();
    void Share.share({ message: url });
  }, []);

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Calendar sync' }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(220)}>
          <Text style={[styles.h1, { color: theme.color.text }]}>
            Your matches in Google Calendar
          </Text>
          <Text style={[styles.sub, { color: theme.color.textMuted }]}>
            Subscribe once and every fixture you follow shows up in Google, Apple or
            Outlook Calendar — kickoff times, competition and venue. It refreshes on its
            own as times change and results come in.
          </Text>
        </Animated.View>

        {feed.status === 'pending' ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.color.accent} />
          </View>
        ) : feed.status === 'error' ? (
          <View style={{ marginTop: spacing[6] }}>
            <ErrorState onRetry={() => void feed.refetch()} />
          </View>
        ) : connected ? (
          <Animated.View entering={FadeInDown.duration(220).delay(60)} style={{ gap: spacing[4], marginTop: spacing[6] }}>
            <Pressable
              onPress={() => {
                haptics.select();
                void Linking.openURL(connected.googleUrl);
              }}
              style={[styles.primary, { backgroundColor: theme.color.accent }]}
              accessibilityRole="button"
            >
              <SettingsIcon name="calendar" color={theme.color.bg} size={18} />
              <Text style={[styles.primaryLabel, { color: theme.color.bg }]}>
                Add to Google Calendar
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                haptics.select();
                void Linking.openURL(connected.webcalUrl);
              }}
              style={[styles.secondary, { borderColor: theme.color.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryLabel, { color: theme.color.text }]}>
                Open in Apple / default calendar
              </Text>
            </Pressable>

            <View
              style={[
                styles.urlBox,
                { backgroundColor: theme.color.bgSunken, borderColor: theme.color.border },
              ]}
            >
              <Text style={[styles.urlLabel, { color: theme.color.textFaint }]}>
                SUBSCRIPTION LINK
              </Text>
              <Text
                style={[styles.url, { color: theme.color.textMuted }]}
                numberOfLines={2}
              >
                {connected.icsUrl}
              </Text>
              <Pressable onPress={() => onCopy(connected.icsUrl)} style={styles.copyBtn}>
                <Text style={[styles.copyLabel, { color: theme.color.accent }]}>
                  Share / copy link
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.fine, { color: theme.color.textFaint }]}>
              On desktop Google Calendar: Other calendars → From URL → paste the link.
              Keep the link private — anyone with it can see your fixtures.
            </Text>

            <Pressable
              onPress={() => {
                haptics.warning();
                disable.mutate();
              }}
              disabled={disable.isPending}
              style={styles.disableBtn}
            >
              <Text style={[styles.disableLabel, { color: theme.color.danger }]}>
                {disable.isPending ? 'Turning off…' : 'Turn off calendar sync'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.duration(220).delay(60)} style={{ marginTop: spacing[8] }}>
            <Button
              label={enable.isPending ? 'Setting up…' : 'Turn on calendar sync'}
              loading={enable.isPending}
              onPress={() => enable.mutate()}
            />
            <Text style={[styles.fine, { color: theme.color.textFaint, marginTop: spacing[4] }]}>
              We create a private subscription link for you. You can turn it off any time,
              which instantly revokes the link.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing[5], paddingBottom: spacing[12] },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 14, lineHeight: 21, marginTop: spacing[3] },
  center: { marginTop: spacing[10], alignItems: 'center' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: radii.card,
  },
  primaryLabel: { fontSize: 16, fontWeight: '700' },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    borderRadius: radii.card,
    borderWidth: 1,
  },
  secondaryLabel: { fontSize: 15, fontWeight: '600' },
  urlBox: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing[4],
    gap: spacing[2],
  },
  urlLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  url: { fontSize: 12, fontFamily: 'monospace' },
  copyBtn: { marginTop: spacing[2] },
  copyLabel: { fontSize: 14, fontWeight: '600' },
  fine: { fontSize: 12, lineHeight: 18 },
  disableBtn: { paddingVertical: spacing[3], alignItems: 'center', marginTop: spacing[2] },
  disableLabel: { fontSize: 14, fontWeight: '600' },
});
