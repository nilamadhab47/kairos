import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Props = {
  name: 'today' | 'calendar' | 'alerts' | 'settings';
  color: string;
  focused?: boolean;
  size?: number;
};

/** Lightweight line icons for the tab bar — no emoji, no icon pack. */
export function TabIcon({ name, color, focused, size = 22 }: Props) {
  const stroke = focused ? 2.2 : 1.8;
  switch (name) {
    case 'today':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={stroke} />
          <Path
            d="M12 7.5V12.2L15 14.5"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect
            x="3.5"
            y="5"
            width="17"
            height="15"
            rx="2.5"
            stroke={color}
            strokeWidth={stroke}
          />
          <Path d="M3.5 10H20.5" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <Path
            d="M8 3.5V6.5M16 3.5V6.5"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'alerts':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M6 16.5V11a6 6 0 1 1 12 0v5.5"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <Path
            d="M4.5 16.5H19.5"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <Path
            d="M10 19.5a2 2 0 0 0 4 0"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'settings':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth={stroke} />
          <Path
            d="M12 3.5V5.2M12 18.8V20.5M4.9 7.1L6.2 8.2M17.8 15.8L19.1 16.9M3.5 12H5.2M18.8 12H20.5M4.9 16.9L6.2 15.8M17.8 8.2L19.1 7.1"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}
