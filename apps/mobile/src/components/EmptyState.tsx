import { StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '@/design';
import { Button } from './Button';

type Props = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, onAction }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: theme.color.textMuted }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing[4], alignSelf: 'center' }}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
  },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  desc: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
