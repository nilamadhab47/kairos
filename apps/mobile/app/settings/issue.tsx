import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Constants from 'expo-constants';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Chip, Screen } from '@/components';
import { haptics, radii, spacing, useTheme } from '@/design';
import { api, ApiError } from '@/lib/api';
import { Header, SuccessState } from './feedback';

const ISSUE_TYPES = [
  { id: 'wrong_score', label: 'Wrong score' },
  { id: 'wrong_time', label: 'Wrong time' },
  { id: 'missing_event', label: 'Missing event' },
  { id: 'wrong_team', label: 'Wrong team' },
  { id: 'wrong_logo', label: 'Wrong logo' },
  { id: 'wrong_competition', label: 'Wrong competition' },
  { id: 'duplicate_event', label: 'Duplicate event' },
  { id: 'outdated_data', label: 'Outdated data' },
  { id: 'other', label: 'Other' },
];

type Response = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
};

type Params = {
  matchId?: string;
  eventId?: string;
  sportId?: string;
  contextLabel?: string;
};

export default function IssueScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<Params>();
  const [category, setCategory] = useState<string>(ISSUE_TYPES[0].id);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Response | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      const platform = Platform.OS;
      const appVersion = Constants.expoConfig?.version ?? null;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return api<Response>('/api/feedback', {
        method: 'POST',
        json: {
          kind: 'issue',
          category,
          message: message.trim(),
          matchId: params.matchId ?? null,
          eventId: params.eventId ?? null,
          sportId: params.sportId ?? null,
          platform,
          appVersion,
          timezone,
          metadata: params.contextLabel ? { contextLabel: params.contextLabel } : {},
        },
      });
    },
    onSuccess: (data) => {
      haptics.success();
      setSubmitted(data);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? "Couldn't send your report." : 'Something went wrong.');
      haptics.error();
    },
  });

  const canSend = message.trim().length >= 3 && !send.isPending;
  const hasContext = Boolean(params.matchId || params.eventId || params.contextLabel);

  if (submitted) {
    return <SuccessState kind="issue" reference={submitted.reference} onDone={() => router.back()} />;
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Report an issue' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header title="Report an issue" subtitle="Wrong score, wrong time, missing event…" />

          {hasContext ? (
            <Animated.View
              entering={FadeInDown.duration(220).delay(60)}
              style={[
                styles.contextCard,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <Text style={[styles.contextLabel, { color: theme.color.textFaint }]}>
                Attached context
              </Text>
              <Text style={[styles.contextTitle, { color: theme.color.text }]} numberOfLines={2}>
                {params.contextLabel ?? params.matchId ?? params.eventId}
              </Text>
              <Text style={[styles.contextMeta, { color: theme.color.textMuted }]} numberOfLines={1}>
                {[params.sportId, params.matchId ? `match ${params.matchId.slice(-6)}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(220).delay(120)} style={styles.section}>
            <Text style={[styles.label, { color: theme.color.textFaint }]}>What's wrong?</Text>
            <View style={styles.chipWrap}>
              {ISSUE_TYPES.map((c) => (
                <Chip
                  key={c.id}
                  label={c.label}
                  selected={category === c.id}
                  onPress={() => setCategory(c.id)}
                />
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(220).delay(180)} style={styles.section}>
            <Text style={[styles.label, { color: theme.color.textFaint }]}>Description</Text>
            <TextInput
              value={message}
              onChangeText={(t) => {
                setMessage(t);
                if (error) setError(null);
              }}
              multiline
              placeholder="What did you expect vs. what did you see?"
              placeholderTextColor={theme.color.textFaint}
              style={[
                styles.textarea,
                {
                  backgroundColor: theme.color.bgSunken,
                  borderColor: theme.color.border,
                  color: theme.color.text,
                },
              ]}
              textAlignVertical="top"
            />
          </Animated.View>

          {error ? (
            <View style={[styles.errorBox, { borderColor: theme.color.danger }]}>
              <Text style={{ color: theme.color.danger, fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(220).delay(240)} style={{ marginTop: spacing[6] }}>
            <Button
              label={send.isPending ? 'Sending…' : 'Send report'}
              loading={send.isPending}
              disabled={!canSend}
              onPress={() => {
                setError(null);
                send.mutate();
              }}
            />
            <Text style={[styles.tinyHint, { color: theme.color.textFaint }]}>
              We'll attach your app version, platform, and timezone to help debug.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing[10], paddingHorizontal: spacing[5] },
  section: { marginTop: spacing[6], gap: spacing[3] },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  textarea: {
    minHeight: 140,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[4],
    fontSize: 15,
    lineHeight: 20,
  },
  contextCard: {
    marginTop: spacing[5],
    padding: spacing[4],
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  contextLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  contextTitle: { fontSize: 15, fontWeight: '700' },
  contextMeta: { fontSize: 12 },
  errorBox: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tinyHint: { fontSize: 11, marginTop: spacing[3], textAlign: 'center' },
});
