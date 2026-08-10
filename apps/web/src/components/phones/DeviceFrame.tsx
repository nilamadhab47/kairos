import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  width?: number;
  className?: string;
};

/**
 * CSS device frame — thin bezel, Dynamic-Island notch, correct radii.
 * The screen content is a real component tree, never an image.
 */
export function DeviceFrame({ children, width = 300, className }: Props) {
  return (
    <div
      className={`device phone-live ${className ?? ''}`}
      style={{ width, height: Math.round(width * (652 / 300)) }}
      data-cursor
    >
      <div className="device-screen">
        {children}
        <div className="device-island" aria-hidden />
        <div className="device-homebar" aria-hidden />
      </div>
    </div>
  );
}
