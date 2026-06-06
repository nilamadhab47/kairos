import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function Today() {
  const { user } = useAuth();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <ScrollView className="flex-1 bg-kairo-bg" contentContainerClassName="px-6 pt-16 pb-12">
      <Text className="font-sans text-sm uppercase tracking-widest text-kairo-muted">
        Today
      </Text>
      <Text className="mt-1 font-sans text-3xl font-bold text-kairo-text">
        Hi {user?.name?.split(' ')[0] ?? 'there'}
      </Text>

      <View className="mt-8 rounded-2xl border border-kairo-border bg-kairo-surface p-5">
        <Text className="font-sans text-xs uppercase tracking-wider text-kairo-muted">
          API status
        </Text>
        <Text className="mt-2 font-sans text-lg text-kairo-text">
          {health.data?.ok ? 'Connected' : 'Checking…'}
        </Text>
        {health.data ? (
          <Text className="mt-1 font-sans text-xs text-kairo-muted">
            db {health.data.checks.db?.latencyMs ?? '—'}ms · redis{' '}
            {health.data.checks.redis?.latencyMs ?? '—'}ms
          </Text>
        ) : null}
      </View>

      <Text className="mt-8 font-sans text-kairo-muted">
        No events yet — onboarding and event ingestion ship in the first feature sprint.
      </Text>
    </ScrollView>
  );
}
