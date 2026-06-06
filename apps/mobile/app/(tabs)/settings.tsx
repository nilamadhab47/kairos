import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';

export default function Settings() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <View className="flex-1 bg-kairo-bg px-6 pt-16">
      <Text className="font-sans text-sm uppercase tracking-widest text-kairo-muted">
        Settings
      </Text>

      <View className="mt-8 rounded-2xl border border-kairo-border bg-kairo-surface p-5">
        <Text className="font-sans text-xs uppercase tracking-wider text-kairo-muted">
          Account
        </Text>
        <Text className="mt-2 font-sans text-lg text-kairo-text">{user?.name ?? '—'}</Text>
        <Text className="mt-1 font-sans text-sm text-kairo-muted">{user?.email ?? '—'}</Text>
        <Text className="mt-1 font-sans text-xs text-kairo-muted">
          Timezone: {user?.timezone ?? '—'}
        </Text>
      </View>

      <Pressable
        onPress={async () => {
          await signOut();
          router.replace('/(auth)/login');
        }}
        className="mt-6 items-center rounded-2xl border border-kairo-border bg-kairo-surface px-6 py-4 active:opacity-70"
      >
        <Text className="font-sans text-base font-semibold text-kairo-text">Sign out</Text>
      </Pressable>
    </View>
  );
}
