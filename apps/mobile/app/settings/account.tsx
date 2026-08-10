import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, SettingsRow, SettingsSurface, Button } from '@/components';
import { haptics, radii, spacing, useTheme } from '@/design';
import { api } from '@/lib/api';
import { authClient, useSession } from '@/lib/auth-client';
import { Header } from './feedback';
import { Avatar, providerLabelFromSession } from '@/components/Avatar';

type Me = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  timezone: string;
  onboardingDone: boolean;
};

export default function AccountScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me') });

  const patchMe = useMutation({
    mutationFn: (body: { timezone?: string; name?: string }) =>
      api<Me>('/api/me', { method: 'PATCH', json: body }),
    onSuccess: (data) => {
      qc.setQueryData(['me'], data);
      haptics.success();
    },
  });

  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzMismatch = me.data?.timezone && me.data.timezone !== deviceTz;
  const provider = providerLabelFromSession(session);

  async function onSignOut() {
    Alert.alert('Sign out', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await authClient.signOut();
            router.replace('/(auth)/welcome');
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  const name = me.data?.name ?? session?.user.name ?? 'Signed in';
  const email = me.data?.email ?? session?.user.email ?? '';
  const image = me.data?.image ?? session?.user.image ?? null;

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Account' }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="Account" subtitle="Manage your Kairos identity." />

        <Animated.View entering={FadeInDown.duration(240).delay(80)} style={styles.cardWrap}>
          <View
            style={[
              styles.hero,
              { backgroundColor: theme.color.surface, borderColor: theme.color.border },
            ]}
          >
            <Avatar name={name} imageUrl={image} size={64} />
            <Text style={[styles.heroName, { color: theme.color.text }]}>{name}</Text>
            <Text style={[styles.heroEmail, { color: theme.color.textMuted }]}>{email}</Text>
            {provider ? (
              <View
                style={[
                  styles.providerPill,
                  { borderColor: theme.color.border, backgroundColor: theme.color.bgSunken },
                ]}
              >
                <Text style={[styles.providerText, { color: theme.color.textMuted }]}>
                  Signed in with {provider}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(240).delay(140)} style={styles.section}>
          <Text style={[styles.eyebrow, { color: theme.color.textFaint }]}>Profile</Text>
          <SettingsSurface>
            <SettingsRow icon="person" title="Name" value={name} />
            <SettingsRow icon="message" title="Email" value={email} />
            <SettingsRow
              icon="calendar"
              title="Timezone"
              value={me.data?.timezone ?? '—'}
              subtitle={tzMismatch ? `Device is on ${deviceTz}` : undefined}
              isLast={!tzMismatch}
            />
            {tzMismatch ? (
              <View style={styles.syncRow}>
                <Button
                  label={`Sync to ${deviceTz}`}
                  variant="secondary"
                  size="md"
                  onPress={() => patchMe.mutate({ timezone: deviceTz })}
                  loading={patchMe.isPending}
                />
              </View>
            ) : null}
          </SettingsSurface>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(240).delay(200)} style={styles.section}>
          <Text style={[styles.eyebrow, { color: theme.color.textFaint }]}>Session</Text>
          <SettingsSurface>
            <SettingsRow
              icon="signout"
              title="Sign out"
              destructive
              onPress={onSignOut}
              isLast
              subtitle={signingOut ? 'Signing out…' : undefined}
            />
          </SettingsSurface>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing[5], paddingBottom: spacing[10] },
  cardWrap: { marginTop: spacing[5] },
  hero: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[5],
    alignItems: 'center',
    gap: spacing[2],
  },
  heroName: { fontSize: 20, fontWeight: '800', marginTop: spacing[3] },
  heroEmail: { fontSize: 13 },
  providerPill: {
    marginTop: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  providerText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  section: { marginTop: spacing[6], gap: spacing[3] },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: spacing[1],
  },
  syncRow: { padding: spacing[3] },
});
