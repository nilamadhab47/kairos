import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';

export type SettingsIconName =
  | 'person'
  | 'heart'
  | 'sliders'
  | 'bell'
  | 'calendar'
  | 'message'
  | 'warning'
  | 'help'
  | 'info'
  | 'lock'
  | 'chevron-right'
  | 'chevron-left'
  | 'signout'
  | 'moon';

type Props = {
  name: SettingsIconName;
  size?: number;
  color: string;
  strokeWidth?: number;
};

export function SettingsIcon({ name, size = 18, color, strokeWidth = 1.7 }: Props) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G {...common}>{paths(name)}</G>
    </Svg>
  );
}

function paths(name: SettingsIconName) {
  switch (name) {
    case 'person':
      return (
        <>
          <Circle cx="12" cy="8" r="3.5" />
          <Path d="M4.5 20c1.5-4 4-5.5 7.5-5.5S18 16 19.5 20" />
        </>
      );
    case 'heart':
      return (
        <Path d="M12 20s-6.5-4-8.5-8.5C1.5 7.5 5 4 8.5 5.5 10.5 6.3 12 8 12 8s1.5-1.7 3.5-2.5C19 4 22.5 7.5 20.5 11.5 18.5 16 12 20 12 20z" />
      );
    case 'sliders':
      return (
        <>
          <Line x1="4" y1="7" x2="20" y2="7" />
          <Line x1="4" y1="12" x2="20" y2="12" />
          <Line x1="4" y1="17" x2="20" y2="17" />
          <Circle cx="9" cy="7" r="2" fill={undefined} />
          <Circle cx="15" cy="12" r="2" />
          <Circle cx="7" cy="17" r="2" />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5l1.5-2z" />
          <Path d="M10 20a2 2 0 0 0 4 0" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x="4" y="5.5" width="16" height="15" rx="2" />
          <Line x1="4" y1="10" x2="20" y2="10" />
          <Line x1="8" y1="3.5" x2="8" y2="7" />
          <Line x1="16" y1="3.5" x2="16" y2="7" />
        </>
      );
    case 'message':
      return (
        <Path d="M4 5h16v11H8.5L4 20V5z" />
      );
    case 'warning':
      return (
        <>
          <Path d="M12 4l9.5 16H2.5L12 4z" />
          <Line x1="12" y1="10" x2="12" y2="14.5" />
          <Circle cx="12" cy="17.5" r="0.6" fill={undefined} />
        </>
      );
    case 'help':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M9.5 9.5a2.5 2.5 0 1 1 4.5 1.5c-1 0.7-2 1.4-2 3" />
          <Circle cx="12" cy="17.5" r="0.6" />
        </>
      );
    case 'info':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Line x1="12" y1="11" x2="12" y2="16.5" />
          <Circle cx="12" cy="8" r="0.6" />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x="5" y="11" width="14" height="10" rx="2" />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      );
    case 'chevron-right':
      return <Polyline points="9,5 16,12 9,19" />;
    case 'chevron-left':
      return <Polyline points="15,5 8,12 15,19" />;
    case 'signout':
      return (
        <>
          <Path d="M14 4h5v16h-5" />
          <Path d="M4 12h11" />
          <Polyline points="8,8 4,12 8,16" />
        </>
      );
    case 'moon':
      return (
        <Path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
      );
    default:
      return null;
  }
}
