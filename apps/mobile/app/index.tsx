import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/lib/auth-client';

export default function Index() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-kairo-bg">
        <ActivityIndicator color="#3ED5BB" size="large" />
      </View>
    );
  }

  if (!session?.user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  const onboardingDone = (session.user as { onboardingDone?: boolean }).onboardingDone;
  if (!onboardingDone) {
    return <Redirect href="/(onboarding)/sports" />;
  }

  return <Redirect href="/(tabs)/today" />;
}
