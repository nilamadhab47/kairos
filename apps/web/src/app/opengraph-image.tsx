import { ImageResponse } from 'next/og';
import { KAIROS_MOMENT, KAIROS_STREAMS, KAIROS_VIEWBOX } from '@/components/kairos-geometry';

export const runtime = 'edge';
export const alt = 'Kairos — Never miss the moments that matter';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#05070A',
          fontFamily: 'sans-serif',
        }}
      >
        <svg viewBox={KAIROS_VIEWBOX} width={150} height={158} fill="#3ED5BB">
          {KAIROS_STREAMS.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <circle cx={KAIROS_MOMENT.cx} cy={KAIROS_MOMENT.cy} r={KAIROS_MOMENT.r} />
        </svg>
        <div
          style={{
            marginTop: 40,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 18,
            color: '#F5F7FA',
          }}
        >
          KAIROS
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 52,
            fontWeight: 600,
            color: '#F5F7FA',
            letterSpacing: -1,
          }}
        >
          Miss nothing that matters.
        </div>
        <div style={{ marginTop: 18, fontSize: 26, color: '#8B93A7' }}>
          Your sports. Your moments. Right on time.
        </div>
      </div>
    ),
    size,
  );
}
