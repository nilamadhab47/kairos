import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

/**
 * Kairos sport icon family.
 *
 * All icons live on a 24×24 grid, drawn with round-capped strokes at
 * `strokeWidth`, using `currentColor` via the `color` prop. This keeps them
 * visually consistent with the Kairos wordmark language and lets the parent
 * decide the accent — no fills, no emojis, no baked colors.
 */
export type SportIconName =
  | 'football'
  | 'cricket'
  | 'f1'
  | 'tennis'
  | 'basketball'
  | 'baseball'
  | 'hockey'
  | 'default';

type Props = {
  name: SportIconName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function SportIcon({ name, size = 22, color = '#FFFFFF', strokeWidth = 1.6 }: Props) {
  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G {...common}>{renderPaths(name)}</G>
    </Svg>
  );
}

function renderPaths(name: string) {
  switch (name) {
    case 'football':
      // Football: outer circle + small central pentagon + 5 short seams.
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 8.4 L14.4 10.2 L13.5 13 L10.5 13 L9.6 10.2 Z" />
          <Line x1={12} y1={8.4} x2={12} y2={5} />
          <Line x1={14.4} y1={10.2} x2={17.2} y2={9} />
          <Line x1={13.5} y1={13} x2={15.5} y2={16.2} />
          <Line x1={10.5} y1={13} x2={8.5} y2={16.2} />
          <Line x1={9.6} y1={10.2} x2={6.8} y2={9} />
        </>
      );
    case 'cricket':
      // Cricket: angled bat + ball.
      return (
        <>
          <Path d="M5 19 L15 9" />
          <Rect x={13} y={4} width={5} height={9} rx={1.2} transform="rotate(35 15.5 8.5)" />
          <Circle cx={7} cy={17} r={2.2} />
        </>
      );
    case 'f1':
      // Formula 1: checkered flag (2×3 grid, 3 filled squares indicated by strokes).
      return (
        <>
          <Path d="M5 20 L5 4" />
          <Rect x={5} y={4} width={14} height={10} />
          <Line x1={5} y1={7.3} x2={19} y2={7.3} />
          <Line x1={5} y1={10.6} x2={19} y2={10.6} />
          <Line x1={9.7} y1={4} x2={9.7} y2={14} />
          <Line x1={14.3} y1={4} x2={14.3} y2={14} />
        </>
      );
    case 'tennis':
      // Tennis: circle + single seam curve.
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M3.4 10.5 C 8.5 12.5 15.5 12.5 20.6 10.5" />
          <Path d="M3.4 13.5 C 8.5 11.5 15.5 11.5 20.6 13.5" />
        </>
      );
    case 'basketball':
      // Basketball: circle + vertical seam + two arcs.
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Line x1={12} y1={3} x2={12} y2={21} />
          <Path d="M3.2 12 C 8 8 16 8 20.8 12" />
          <Path d="M3.2 12 C 8 16 16 16 20.8 12" />
        </>
      );
    case 'baseball':
      // Baseball: circle + two stitch curves.
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M6 5.5 C 8.5 8.5 8.5 15.5 6 18.5" />
          <Path d="M18 5.5 C 15.5 8.5 15.5 15.5 18 18.5" />
        </>
      );
    case 'hockey':
      // Hockey: stick + puck.
      return (
        <>
          <Path d="M6 5 L16 15 L18 19" />
          <Path d="M14 15 L18 15" />
          <Rect x={4} y={18} width={7} height={2.4} rx={1.2} />
        </>
      );
    default:
      // Neutral fallback: a Kairos-style convergence dot.
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Circle cx={12} cy={12} r={2} fill={undefined} />
        </>
      );
  }
}
