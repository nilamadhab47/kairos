'use client';

import dynamic from 'next/dynamic';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDesktopPointer, usePrefersReducedMotion } from '@/lib/hooks';
import { LineReveal } from '../ClipReveal';
import { Magnetic } from '../Magnetic';
import { StoreButtons } from '../StoreButtons';
import { DeviceFrame } from '../phones/DeviceFrame';
import { TodayScreen } from '../phones/TodayScreen';

const HeroBackdrop = dynamic(() => import('./HeroBackdrop'), { ssr: false });

export function Hero() {
  const reduced = usePrefersReducedMotion();
  const desktop = useDesktopPointer();
  const [mountCanvas, setMountCanvas] = useState(false);

  // Lazy-mount the WebGL canvas after the main thread settles.
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setMountCanvas(true), 600);
    return () => window.clearTimeout(t);
  }, [reduced]);

  return (
    <section className="relative overflow-hidden pt-32 sm:pt-40">
      {mountCanvas && <HeroBackdrop />}
      <div
        className="glow left-1/2 top-[-10%] h-[540px] w-[540px] -translate-x-1/2"
        style={{ background: 'rgba(62, 213, 187, 0.11)' }}
      />

      <div className="relative mx-auto grid max-w-wrap items-center gap-16 px-5 pb-24 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:pb-32">
        <div>
          <motion.span
            className="eyebrow inline-block"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.05 }}
          >
            For people who care about the game
          </motion.span>

          <LineReveal
            as="h1"
            className="display-xl mt-5 text-paper-900"
            lines={['Miss nothing', 'that matters.']}
            stagger={0.08}
            delay={0.15}
          />

          <motion.p
            className="lede mt-6 max-w-md"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.2, 0.65, 0.25, 1] }}
          >
            Kairos follows your teams, leagues and races — and nudges you right before the moments
            you&apos;d hate to miss. No feeds. No noise. Just your sports, right on time.
          </motion.p>

          <motion.div
            className="mt-9"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65, ease: [0.2, 0.65, 0.25, 1] }}
          >
            <StoreButtons magnetic />
            <p className="mt-4 text-[13px] text-paper-300">
              Launching soon on iOS and Android.{' '}
              <a
                href="mailto:nilamadhab47@gmail.com?subject=Kairos%20early%20access"
                className="text-brand-300 hover:text-brand-200"
              >
                Ask for early access →
              </a>
            </p>
          </motion.div>
        </div>

        <motion.div
          className="justify-self-center lg:justify-self-end"
          initial={reduced ? false : { opacity: 0, y: 42 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.2, 0.65, 0.25, 1] }}
        >
          <div className="relative">
            <div
              className="glow left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2"
              style={{ background: 'rgba(62, 213, 187, 0.09)' }}
            />
            <FloatingTiltPhone active={desktop && !reduced} float={!reduced}>
              <DeviceFrame width={300}>
                <TodayScreen />
              </DeviceFrame>
            </FloatingTiltPhone>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Gentle idle float (y loop) + mouse-parallax tilt capped at ~6deg. */
function FloatingTiltPhone({
  children,
  active,
  float,
}: {
  children: ReactNode;
  active: boolean;
  float: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 16 });
  const sy = useSpring(my, { stiffness: 120, damping: 16 });
  const rotateY = useTransform(sx, [-1, 1], [-6, 6]);
  const rotateX = useTransform(sy, [-1, 1], [6, -6]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!active || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mx.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    my.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      className="relative"
      animate={float ? { y: [0, -10, 0] } : undefined}
      transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <motion.div
        ref={ref}
        style={active ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
