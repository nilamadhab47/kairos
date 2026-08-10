import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '@/design';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Screen,
  SectionHeader,
  SkeletonCard,
  StatusPill,
  TeamCrest,
} from '@/components';
import { useState } from 'react';

/**
 * Dev-only preview of every design primitive + state. Not linked from
 * navigation — open via `/(preview)` deep link (`kairo:///_preview`).
 */
export default function DesignPreview() {
  const theme = useTheme();
  const [chip, setChip] = useState('football');

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing[10] }}>
        <View style={{ paddingHorizontal: spacing[5], paddingTop: spacing[4] }}>
          <Text style={{ color: theme.color.text, fontSize: 28, fontWeight: '700' }}>
            Design system
          </Text>
          <Text style={{ color: theme.color.textMuted, marginTop: 4 }}>
            Primitives + motion + status
          </Text>
        </View>

        <SectionHeader title="Buttons" />
        <View style={styles.section}>
          <Button label="Primary" onPress={() => undefined} />
          <View style={{ height: 8 }} />
          <Button label="Secondary" variant="secondary" onPress={() => undefined} />
          <View style={{ height: 8 }} />
          <Button label="Ghost" variant="ghost" onPress={() => undefined} />
          <View style={{ height: 8 }} />
          <Button label="Danger" variant="danger" onPress={() => undefined} />
          <View style={{ height: 8 }} />
          <Button label="Loading" loading onPress={() => undefined} />
        </View>

        <SectionHeader title="Chips" />
        <View style={[styles.section, styles.row]}>
          {(['football', 'f1', 'cricket', 'tennis'] as const).map((s) => (
            <Chip
              key={s}
              label={s.toUpperCase()}
              selected={chip === s}
              onPress={() => setChip(s)}
              accentColor={theme.sport[s]}
            />
          ))}
        </View>

        <SectionHeader title="Status" />
        <View style={[styles.section, styles.row]}>
          <StatusPill state="live" />
          <StatusPill state="upcoming" />
          <StatusPill state="ft" />
          <StatusPill state="postponed" />
        </View>

        <SectionHeader title="Card + crests" />
        <View style={styles.section}>
          <Card onPress={() => undefined}>
            <View style={styles.cardRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TeamCrest name="Arsenal" logoUrl={null} accentColor="#EF0107" />
                <Text style={{ color: theme.color.text, fontWeight: '600' }}>
                  Arsenal vs Chelsea
                </Text>
                <TeamCrest name="Chelsea" logoUrl={null} accentColor="#034694" />
              </View>
              <StatusPill state="live" />
            </View>
          </Card>
        </View>

        <SectionHeader title="Skeleton" />
        <View style={styles.section}>
          <SkeletonCard />
        </View>

        <SectionHeader title="Empty state" />
        <EmptyState
          title="Nothing today"
          description="Here's tomorrow instead."
          actionLabel="Browse sports"
          onAction={() => undefined}
        />

        <SectionHeader title="Error state" />
        <ErrorState onRetry={() => undefined} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing[5] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
