import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { radii, spacing, useTheme } from '@/design';

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** Show eye toggle when `secureTextEntry` is set. Defaults to true. */
  secureToggle?: boolean;
};

export function TextField({
  label,
  error,
  style,
  secureTextEntry,
  secureToggle = true,
  ...rest
}: Props) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const showToggle = Boolean(secureTextEntry) && secureToggle;
  const hidden = Boolean(secureTextEntry) && !visible;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.color.textMuted }]}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={theme.color.textFaint}
          autoCapitalize="none"
          secureTextEntry={hidden}
          style={[
            styles.input,
            showToggle && styles.inputWithToggle,
            {
              backgroundColor: theme.color.bgSunken,
              borderColor: error ? theme.color.danger : theme.color.border,
              color: theme.color.text,
            },
            style,
          ]}
          {...rest}
        />
        {showToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setVisible((v) => !v)}
            style={styles.toggle}
          >
            <EyeIcon open={visible} color={theme.color.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: theme.color.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

function EyeIcon({ open, color }: { open: boolean; color: string }) {
  const common = {
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <G {...common}>
        {open ? (
          <>
            <Path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <Circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <Path d="M2.5 12s3.5-6.5 9.5-6.5c2.2 0 4.1.7 5.6 1.7" />
            <Path d="M21.5 12s-3.5 6.5-9.5 6.5c-2.2 0-4.1-.7-5.6-1.7" />
            <Path d="M9.5 9.6a3 3 0 0 0 4.9 4.8" />
            <Path d="M4 4l16 16" />
          </>
        )}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[2] },
  label: { fontSize: 13, fontWeight: '600' },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  input: {
    height: 52,
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    fontSize: 16,
  },
  inputWithToggle: {
    paddingRight: 48,
  },
  toggle: {
    position: 'absolute',
    right: 12,
    height: 52,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 13 },
});
