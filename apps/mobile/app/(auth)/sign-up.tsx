import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Link, router } from 'expo-router';
import { BrandMark, Button, Screen, TextField } from '@/components';
import { spacing, useTheme } from '@/design';
import { authClient } from '@/lib/auth-client';

export default function SignUpScreen() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: name.trim() || email.split('@')[0] || 'Kairo user',
      });
      if (err) {
        setError(err.message ?? 'Could not sign up');
        return;
      }
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign up');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.pad}>
          <Animated.View entering={FadeInDown.duration(280)}>
            <BrandMark size="sm" />
            <Text style={[styles.title, { color: theme.color.text }]}>Create account</Text>
            <Text style={[styles.sub, { color: theme.color.textMuted }]}>
              Under a minute to your first timeline.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(280)} style={styles.form}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              placeholder="Maya"
            />
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            {error ? <Text style={{ color: theme.color.danger, fontSize: 13 }}>{error}</Text> : null}
            <Button label="Create account" loading={loading} onPress={() => void onSubmit()} />
            <Link href="/(auth)/sign-in" asChild>
              <Pressable style={styles.link}>
                <Text style={{ color: theme.color.accent, fontWeight: '600', fontSize: 14 }}>
                  Already have an account?
                </Text>
              </Pressable>
            </Link>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, paddingHorizontal: spacing[5], paddingTop: spacing[4] },
  title: { marginTop: spacing[8], fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  sub: { marginTop: spacing[2], fontSize: 15 },
  form: { marginTop: spacing[8], gap: spacing[4] },
  link: { alignItems: 'center', paddingVertical: spacing[2] },
});
