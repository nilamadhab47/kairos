import { KAIROS_MOMENT, KAIROS_STREAMS, KAIROS_VIEWBOX } from './kairos-geometry';

type Props = {
  size?: number;
  className?: string;
  /** Staggered stream fade-in + settle + breathing loop. */
  animated?: boolean;
  /** Extremely slow ambient rotation (hero only). */
  drift?: boolean;
};

/**
 * The Kairos mark — eleven streams converging on a single moment point.
 * Rendered inline so streams can animate individually.
 */
export function KairosMark({ size = 96, className, animated = false, drift = false }: Props) {
  const svg = (
    <svg
      viewBox={KAIROS_VIEWBOX}
      width={size}
      height={size}
      className={drift ? 'mark-drift' : undefined}
      role="img"
      aria-label="Kairos"
      fill="currentColor"
    >
      {KAIROS_STREAMS.map((d, i) => (
        <path
          key={i}
          d={d}
          className={animated ? 'mark-stream' : undefined}
          style={animated ? { animationDelay: `${120 + i * 70}ms` } : undefined}
        />
      ))}
      <circle
        cx={KAIROS_MOMENT.cx}
        cy={KAIROS_MOMENT.cy}
        r={KAIROS_MOMENT.r}
        className={animated ? 'mark-stream' : undefined}
        style={animated ? { animationDelay: '950ms' } : undefined}
      />
    </svg>
  );

  if (!animated) {
    return <span className={className}>{svg}</span>;
  }

  return (
    <span className={`mark-enter inline-block ${className ?? ''}`}>
      <span className="mark-breathe inline-block">{svg}</span>
    </span>
  );
}
