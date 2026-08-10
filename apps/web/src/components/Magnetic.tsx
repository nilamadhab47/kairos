'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { useDesktopPointer, usePrefersReducedMotion } from '@/lib/hooks';

type Props = {
  children: ReactNode;
  /** How far the element chases the cursor, in px. */
  strength?: number;
  className?: string;
};

/** Magnetic hover: the child drifts a few px toward the cursor while hovered. */
export function Magnetic({ children, strength = 10, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const desktop = useDesktopPointer();
  const reduced = usePrefersReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(my, { stiffness: 220, damping: 18, mass: 0.4 });

  const active = desktop && !reduced;

  const onPointerMove = (e: React.PointerEvent) => {
    if (!active || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    mx.set((dx / (rect.width / 2)) * strength);
    my.set((dy / (rect.height / 2)) * strength);
  };

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={`inline-block ${className ?? ''}`}
      style={active ? { x, y } : undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      data-cursor
    >
      {children}
    </motion.div>
  );
}
