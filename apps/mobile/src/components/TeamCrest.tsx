import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { radii, useTheme } from '@/design';

type Props = {
  name: string;
  logoUrl?: string | null;
  size?: number;
  accentColor?: string | null;
};

/** Round crest with fallback initials + optional team-color ring. */
export function TeamCrest({ name, logoUrl, size = 40, accentColor }: Props) {
  const theme = useTheme();
  const initials = toInitials(name);
  const ringWidth = accentColor ? 2 : StyleSheet.hairlineWidth;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          borderColor: accentColor ?? theme.color.border,
          borderWidth: ringWidth,
          backgroundColor: theme.color.bgElevated,
        },
      ]}
    >
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size - 8, height: size - 8, borderRadius: radii.pill }}
          contentFit="contain"
          transition={140}
          cachePolicy="memory-disk"
        />
      ) : (
        <Text
          style={{
            color: theme.color.textMuted,
            fontWeight: '700',
            fontSize: Math.max(10, size / 3),
            letterSpacing: 0.4,
          }}
          numberOfLines={1}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const chars = parts.map((p) => p[0]?.toUpperCase() ?? '').filter(Boolean);
  return chars.join('') || '?';
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
