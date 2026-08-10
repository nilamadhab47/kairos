import Svg, { G, Path } from 'react-native-svg';

type Props = {
  width?: number;
  color?: string;
  /**
   * Stroke weight of the letterforms.
   * The source geometry is drawn at 14.5. Reduce for a more refined feel at
   * smaller sizes; increase for display / hero use.
   */
  strokeWidth?: number;
};

const VB = { minX: -14.5, minY: -14.5, w: 477, h: 129 } as const;

/**
 * KAIROS wordmark — real vector geometry from brand/dist/kairos-wordmark.svg.
 * Letterforms drawn as stroked paths so weight scales with the accent color.
 */
export function KairosWordmark({ width = 140, color = '#3ED5BB', strokeWidth = 12 }: Props) {
  const height = (width * VB.h) / VB.w;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`${VB.minX} ${VB.minY} ${VB.w} ${VB.h}`}
      accessibilityLabel="KAIROS"
    >
      <G
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <G translateX={0} translateY={0}>
          <Path d="M8 2 L8 98" />
          <Path d="M60 2 L9 53" />
          <Path d="M25 37 L64 98" />
        </G>
        <G translateX={84} translateY={0}>
          <Path d="M4 98 L38 2 L72 98" />
          <Path d="M18 64 L58 64" />
        </G>
        <G translateX={176} translateY={0}>
          <Path d="M8 2 L8 98" />
        </G>
        <G translateX={206} translateY={0}>
          <Path d="M8 2 L8 98" />
          <Path d="M8 8 L36 8 C60 8 60 50 36 50 L8 50" />
          <Path d="M34 50 L62 98" />
        </G>
        <G translateX={288} translateY={0}>
          <Path d="M38 2 C17 2 7 23 7 50 C7 77 17 98 38 98 C59 98 69 77 69 50 C69 23 59 2 38 2 Z" />
        </G>
        <G translateX={378} translateY={0}>
          <Path d="M58 15 C51 3 20 1 13 18 C6 35 26 42 37 46 C50 51 64 58 59 77 C54 97 20 100 9 85" />
        </G>
      </G>
    </Svg>
  );
}
