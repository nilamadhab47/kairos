import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/design';

type Props = {
  children: ReactNode;
  padded?: boolean;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
};

export function Screen({ children, padded = false, style, edges = ['top'] }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[
        styles.safe,
        { backgroundColor: theme.color.bg },
        padded && styles.padded,
        style as object,
      ]}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  padded: { paddingHorizontal: 20 },
});
