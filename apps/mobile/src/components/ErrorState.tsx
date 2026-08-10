import { StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '@/design';
import { Button } from './Button';

type Props = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "We couldn't load that",
  description = 'Check your connection and try again.',
  onRetry,
}: Props) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
      <Text style={[styles.desc, { color: theme.color.textMuted }]}>{description}</Text>
      {onRetry ? (
        <View style={{ marginTop: spacing[4], alignSelf: 'center' }}>
          <Button label="Try again" onPress={onRetry} variant="secondary" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
  },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  desc: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
