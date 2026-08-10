import { Text, View, type ViewProps } from 'react-native';
import { useTheme } from '@/design';
import { KairosMark } from './KairosMark';

type Props = ViewProps & {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
};

const sizes = {
  sm: { box: 30, text: 14 },
  md: { box: 44, text: 18 },
  lg: { box: 84, text: 30 },
};

export function BrandMark({ size = 'md', showWordmark = true, style, ...rest }: Props) {
  const theme = useTheme();
  const s = sizes[size];
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}
      {...rest}
    >
      <KairosMark size={s.box} color={theme.color.accent} />
      {showWordmark ? (
        <Text
          style={{
            fontSize: s.text,
            fontWeight: '700',
            letterSpacing: s.text * 0.22,
            color: theme.color.accent,
          }}
        >
          KAIROS
        </Text>
      ) : null}
    </View>
  );
}
