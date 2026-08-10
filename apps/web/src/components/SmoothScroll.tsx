'use client';

import { ReactLenis, useLenis } from 'lenis/react';
import { useEffect, type ReactNode } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { usePrefersReducedMotion } from '@/lib/hooks';

/**
 * Lenis smooth scroll driven by GSAP's ticker, with ScrollTrigger kept in
 * sync. Uses the reactive useLenis hook so the driver attaches as soon as
 * the instance exists — a plain ref can miss it and leave scroll dead.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <ReactLenis root options={{ autoRaf: false, lerp: 0.12 }}>
      <LenisDriver />
      {children}
    </ReactLenis>
  );
}

function LenisDriver() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    lenis.on('scroll', ScrollTrigger.update);
    const update = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>(
        'a[href^="#"], a[href^="/#"]',
      );
      if (!anchor) return;
      const href = anchor.getAttribute('href')!;
      if (window.location.pathname !== '/' && href.startsWith('/#')) {
        return; // let Next navigate home first
      }
      const target = document.querySelector(href.replace(/^\//, ''));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -72, duration: 1.4 });
    };
    document.addEventListener('click', onClick);

    return () => {
      lenis.off('scroll', ScrollTrigger.update);
      gsap.ticker.remove(update);
      document.removeEventListener('click', onClick);
    };
  }, [lenis]);

  return null;
}
