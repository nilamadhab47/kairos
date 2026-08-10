'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { ClipReveal } from '../ClipReveal';
import { KairosMark } from '../KairosMark';

/**
 * The brand beat: the mark idles in a slow spin and accelerates with scroll
 * velocity, settling back when the user stops. Runs only while on screen.
 */
export function BrandMoment() {
  const sectionRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const mark = markRef.current;
    if (!section || !mark) return;

    let raf = 0;
    let running = false;
    let rotation = 0;
    let smoothedVelocity = 0;
    let lastY = window.scrollY;

    const tick = () => {
      const y = window.scrollY;
      const dy = Math.abs(y - lastY);
      lastY = y;
      smoothedVelocity += (dy - smoothedVelocity) * 0.08;

      // 0.06deg/frame idle → up to ~3deg/frame at fast scroll
      const speed = 0.06 + Math.min(smoothedVelocity * 0.09, 3);
      rotation = (rotation + speed) % 360;
      mark.style.transform = `rotate(${rotation}deg)`;
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && !running) {
          running = true;
          lastY = window.scrollY;
          raf = requestAnimationFrame(tick);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(section);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-28 lg:py-36">
      <div className="hairline absolute inset-x-0 top-0" />
      <div
        className="glow left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2"
        style={{ background: 'rgba(62, 213, 187, 0.07)' }}
      />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <ClipReveal>
          <div className="index-row mb-14">
            <span className="index-num">04</span>
            <span className="index-rule" />
            <span className="index-label">Kairos</span>
          </div>
        </ClipReveal>
        <ClipReveal delay={0.05}>
          <div ref={markRef} className="inline-block will-change-transform">
            <KairosMark size={72} className="text-brand-300" />
          </div>
        </ClipReveal>
        <ClipReveal delay={0.1}>
          <h2 className="display-lg mt-8 text-paper-900">
            <span className="text-brand-300">Kairos</span> — the ancient Greek word for the right
            moment.
          </h2>
        </ClipReveal>
        <ClipReveal delay={0.2}>
          <p className="lede mx-auto mt-6 max-w-xl">
            Not clock time — the opportune instant. The kickoff. The lights going out. The first
            ball. We built an app around a single promise: you&apos;ll be there for yours.
          </p>
        </ClipReveal>
      </div>
    </section>
  );
}
