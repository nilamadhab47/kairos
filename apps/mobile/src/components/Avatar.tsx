import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/design';

type Props = {
  name?: string | null;
  imageUrl?: string | null;
  size?: number;
};

export function Avatar({ name, imageUrl, size = 40 }: Props) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = imageUrl && !failed;
  const initials = deriveInitials(name);
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (showImage) {
    return (
      <Image
        source={{ uri: imageUrl! }}
        style={[dim, styles.image, { borderColor: theme.color.border }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        dim,
        styles.fallback,
        {
          backgroundColor: theme.color.bgSunken,
          borderColor: theme.color.border,
        },
      ]}
    >
      <Text
        style={{
          color: theme.color.text,
          fontSize: Math.round(size * 0.36),
          fontWeight: '700',
          letterSpacing: 0.5,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

function deriveInitials(name?: string | null): string {
  const n = (name ?? '').trim();
  if (!n) return '·';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Better Auth doesn't uniformly expose provider info on the session object.
 * Return a human label ONLY when we can genuinely infer one from the image
 * URL host — otherwise return null (don't fabricate).
 */
export function providerLabelFromSession(
  session: { user?: { image?: string | null } } | null | undefined,
): string | null {
  const img = session?.user?.image ?? '';
  if (!img) return null;
  if (/googleusercontent\.com/i.test(img)) return 'Google';
  if (/appleid|apple\.com/i.test(img)) return 'Apple';
  if (/githubusercontent\.com/i.test(img)) return 'GitHub';
  return null;
}

const styles = StyleSheet.create({
  image: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
