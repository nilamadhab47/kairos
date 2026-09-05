import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { radii, useTheme } from '@/design';

type Props = {
  name: string;
  logoUrl?: string | null;
  size?: number;
  accentColor?: string | null;
};

/**
 * Round crest with fallback initials.
 *
 * Stitch "Obsidian Precision" treatment: the crest sits in a layered dark
 * circular tile (elevated surface + hairline edge) instead of a coloured
 * ring. When an accentColor is supplied it is used only as a whisper-faint
 * tint on the border so team identity reads without neon halos.
 */
export function TeamCrest({ name, logoUrl, size = 40, accentColor }: Props) {
  const theme = useTheme();
  const initials = toInitials(name);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          borderColor: accentColor ? withAlpha(accentColor, 0.22) : theme.color.border,
          borderWidth: StyleSheet.hairlineWidth,
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

function withAlpha(hex: string, a: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
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
