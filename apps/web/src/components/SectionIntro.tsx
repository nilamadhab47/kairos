'use client';

import type { ReactNode } from 'react';
import { ClipReveal } from './ClipReveal';

type Props = {
  index: string;
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
};

/**
 * Editorial section opener: numbered index + hairline + label on one row,
 * display headline beneath. Keeps every section speaking the same language.
 */
export function SectionIntro({ index, label, title, lede, align = 'left', className }: Props) {
  const centered = align === 'center';

  return (
    <div className={className}>
      <ClipReveal>
        <div className="index-row">
          <span className="index-num">{index}</span>
          <span className="index-rule" />
          <span className="index-label">{label}</span>
        </div>
      </ClipReveal>
      <ClipReveal delay={0.08}>
        <h2
          className={`display-lg mt-8 text-paper-900 ${centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}`}
        >
          {title}
        </h2>
      </ClipReveal>
      {lede != null && (
        <ClipReveal delay={0.16}>
          <p className={`lede mt-6 max-w-xl ${centered ? 'mx-auto text-center' : ''}`}>{lede}</p>
        </ClipReveal>
      )}
    </div>
  );
}
