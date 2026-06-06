import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoogleSignIn } from '../../src/lib/auth';
import { useAuth } from '../../src/providers/AuthProvider';

export default function Login() {
  const router = useRouter();
  const { setUser } = useAuth();

  const { ready, promptAsync } = useGoogleSignIn((user) => {
    setUser(user);
    router.replace('/(tabs)/today');
  });

  return (
    <View className="flex-1 items-center justify-center bg-kairo-bg px-8">
      <View className="w-full max-w-sm">
        <Text className="font-sans text-4xl font-bold text-kairo-text">Kairo</Text>
        <Text className="mt-2 font-sans text-base text-kairo-muted">
          The right moment, not just the right time.
        </Text>

        <Pressable
          onPress={() => void promptAsync()}
          disabled={!ready}
          className="mt-12 items-center rounded-2xl bg-kairo-accent px-6 py-4 active:opacity-80 disabled:opacity-40"
        >
          <Text className="font-sans text-base font-semibold text-white">
            Continue with Google
          </Text>
        </Pressable>

        <Text className="mt-6 text-center font-sans text-xs text-kairo-muted">
          We use Google sign-in for Calendar access.
        </Text>
      </View>
    </View>
  );
}
