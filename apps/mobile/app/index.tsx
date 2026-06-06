import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../src/lib/api';
import { useAuth } from '../src/providers/AuthProvider';

/**
 * Boot screen: pings the Fastify /health endpoint to confirm connectivity,
 * then redirects to /(auth)/login or /(tabs)/today based on auth state.
 */
export default function Index() {
  const { user, loading } = useAuth();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (health.error) {
      // eslint-disable-next-line no-console
      console.warn('[boot] health check failed:', health.error);
    }
  }, [health.error]);

  if (loading || health.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-kairo-bg">
        <ActivityIndicator color="#FF5F1F" />
        <Text className="mt-4 font-sans text-kairo-muted">Connecting to Kairo…</Text>
      </View>
    );
  }

  if (health.isError || !health.data?.ok) {
    return (
      <View className="flex-1 items-center justify-center bg-kairo-bg px-6">
        <Text className="font-sans text-2xl font-semibold text-kairo-text">No connection</Text>
        <Text className="mt-2 text-center font-sans text-kairo-muted">
          Could not reach the Kairo API. Make sure the server is running and{' '}
          <Text className="text-kairo-accent">EXPO_PUBLIC_API_URL</Text> is set correctly.
        </Text>
        {health.error ? (
          <Text className="mt-4 font-sans text-xs text-kairo-muted">
            {String((health.error as Error).message)}
          </Text>
        ) : null}
      </View>
    );
  }

  // Connected. Surface a brief confirmation via console; route based on auth.
  // eslint-disable-next-line no-console
  console.log('[boot] connected to api', health.data.checks);

  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)/today" />;
}
