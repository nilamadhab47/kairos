'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  delay?: number;
  className?: string;
};

/** Reveals content by unmasking top-to-bottom (clip-path), not by fading. */
export function ClipReveal({ children, delay = 0, className }: Props) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ clipPath: 'inset(0 0 100% 0)', y: 18 }}
      whileInView={{ clipPath: 'inset(0 0 0% 0)', y: 0 }}
      viewport={{ once: true, margin: '0px 0px -15% 0px' }}
      transition={{ duration: 0.85, delay, ease: [0.2, 0.65, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Line-by-line masked reveal for display headlines (à la grassfeld). */
export function LineReveal({
  lines,
  as: Tag = 'h1',
  className,
  lineClassName,
  stagger = 0.08,
  delay = 0,
}: {
  lines: ReactNode[];
  as?: 'h1' | 'h2';
  className?: string;
  lineClassName?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <Tag className={className}>
      {lines.map((line, i) => (
        <span key={i} className={`block overflow-hidden ${lineClassName ?? ''}`}>
          <motion.span
            className="block"
            initial={reduced ? false : { y: '110%', clipPath: 'inset(0 0 100% 0)' }}
            animate={{ y: '0%', clipPath: 'inset(0 0 -10% 0)' }}
            transition={{
              duration: 0.9,
              delay: delay + i * stagger,
              ease: [0.2, 0.75, 0.2, 1],
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
