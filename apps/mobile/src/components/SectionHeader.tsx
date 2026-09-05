import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '@/design';

type Props = {
  title: string;
  trailing?: React.ReactNode;
};

export function SectionHeader({ title, trailing }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.color.textMuted }]}>{title.toUpperCase()}</Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    marginBottom: spacing[2],
    marginTop: spacing[5],
  },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, fontFamily: fonts.bodyBold },
});
