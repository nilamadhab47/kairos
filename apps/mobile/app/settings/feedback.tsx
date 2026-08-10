import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Chip, Screen, SettingsIcon } from '@/components';
import { haptics, radii, spacing, useTheme } from '@/design';
import { api, ApiError } from '@/lib/api';

type Category = { id: string; label: string };

const CATEGORIES: Category[] = [
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'like', label: 'Something I like' },
  { id: 'dislike', label: "Something isn't working" },
  { id: 'data', label: 'Data issue' },
  { id: 'design', label: 'Design' },
  { id: 'other', label: 'Other' },
];

type Response = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
};

export default function FeedbackScreen() {
  const theme = useTheme();
  const [category, setCategory] = useState<string>('suggestion');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      const platform = Platform.OS;
      const appVersion =
        Constants.expoConfig?.version ??
        (Constants.manifest2 as { runtimeVersion?: string } | undefined)?.runtimeVersion ??
        null;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return api<Response>('/api/feedback', {
        method: 'POST',
        json: {
          kind: 'feedback',
          category,
          message: message.trim(),
          platform,
          appVersion,
          timezone,
        },
      });
    },
    onSuccess: (data) => {
      haptics.success();
      setSubmitted(data);
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError ? "Couldn't send your feedback." : 'Something went wrong.';
      setError(msg);
      haptics.error();
    },
  });

  const canSend = message.trim().length >= 3 && !send.isPending;

  if (submitted) {
    return <SuccessState kind="feedback" reference={submitted.reference} onDone={() => router.back()} />;
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Send feedback' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header title="Send feedback" subtitle="Ideas, praise, gripes — we read everything." />

          <Animated.View entering={FadeInDown.duration(220).delay(60)} style={styles.section}>
            <Text style={[styles.label, { color: theme.color.textFaint }]}>Category</Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  label={c.label}
                  selected={category === c.id}
                  onPress={() => setCategory(c.id)}
                />
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(220).delay(120)} style={styles.section}>
            <Text style={[styles.label, { color: theme.color.textFaint }]}>What do you think?</Text>
            <TextInput
              value={message}
              onChangeText={(t) => {
                setMessage(t);
                if (error) setError(null);
              }}
              multiline
              placeholder="Tell us what's on your mind…"
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
            <Text style={[styles.hint, { color: theme.color.textFaint }]}>
              {message.trim().length}/2000
            </Text>
          </Animated.View>

          {error ? (
            <View style={[styles.errorBox, { borderColor: theme.color.danger }]}>
              <Text style={{ color: theme.color.danger, fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(220).delay(180)} style={{ marginTop: spacing[6] }}>
            <Button
              label={send.isPending ? 'Sending…' : 'Send feedback'}
              loading={send.isPending}
              disabled={!canSend}
              onPress={() => {
                setError(null);
                send.mutate();
              }}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

export function Header({ title, subtitle }: { title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => {
          haptics.light();
          router.back();
        }}
        style={styles.back}
        hitSlop={12}
      >
        <SettingsIcon name="chevron-right" color={theme.color.text} size={20} />
      </Pressable>
      <View style={{ marginTop: spacing[3] }}>
        <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.color.textMuted }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function SuccessState({
  kind,
  reference,
  onDone,
}: {
  kind: 'feedback' | 'issue';
  reference: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  const isIssue = kind === 'issue';
  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.successRoot}>
        <Animated.View entering={FadeIn.duration(320)} style={styles.successBody}>
          <View
            style={[
              styles.successBadge,
              { borderColor: theme.color.accent, backgroundColor: theme.color.bgSunken },
            ]}
          >
            <SettingsIcon
              name={isIssue ? 'warning' : 'message'}
              color={theme.color.accent}
              size={22}
            />
          </View>
          <Text style={[styles.successEyebrow, { color: theme.color.textFaint }]}>
            {isIssue ? 'Report received' : 'Thank you'}
          </Text>
          <Text style={[styles.successTitle, { color: theme.color.text }]}>
            {isIssue ? "Thanks for helping us\nmake Kairos better." : "We've got it."}
          </Text>
          <Text style={[styles.successRef, { color: theme.color.textMuted }]}>
            Reference {reference}
          </Text>
        </Animated.View>
        <View style={{ padding: spacing[5] }}>
          <Button label="Done" onPress={onDone} />
        </View>
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing[10], paddingHorizontal: spacing[5] },
  header: { paddingTop: spacing[2] },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '180deg' }],
    marginLeft: -8,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 4 },
  section: { marginTop: spacing[6], gap: spacing[3] },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  textarea: {
    minHeight: 160,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[4],
    fontSize: 15,
    lineHeight: 20,
  },
  hint: { fontSize: 11, textAlign: 'right' },
  errorBox: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
  },
  successRoot: { flex: 1, justifyContent: 'space-between' },
  successBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[6] },
  successBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  successEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginTop: spacing[3],
    lineHeight: 32,
  },
  successRef: { fontSize: 13, marginTop: spacing[4], letterSpacing: 0.5 },
});
