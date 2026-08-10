'use client';

import { motion, type Variants } from 'framer-motion';
import { useLayoutEffect, useRef } from 'react';
import { gsap } from '@/lib/gsap';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { SectionIntro } from '../SectionIntro';

const STEPS = [
  {
    n: '01',
    title: 'Pick your sports',
    sub: 'Football, cricket, Formula 1 — choose what you actually watch.',
  },
  {
    n: '02',
    title: 'Follow your teams',
    sub: 'Clubs, leagues, national sides or the whole series. Under a minute.',
  },
  {
    n: '03',
    title: 'Get nudged, right on time',
    sub: "A quiet push before every event you follow. That's it. That's the app.",
  },
] as const;

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const stepVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 180, damping: 24 } },
};

export function HowItWorks() {
  const reduced = usePrefersReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  // The timeline fills left-to-right, scrubbed to scroll; nodes light as it passes.
  useLayoutEffect(() => {
    if (reduced) return;
    const rail = railRef.current;
    const line = lineRef.current;
    if (!rail || !line) return;

    const ctx = gsap.context(() => {
      const nodes = gsap.utils.toArray<HTMLElement>('[data-step-node]', rail);
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: rail,
          start: 'top 80%',
          end: 'bottom 45%',
          scrub: 0.5,
        },
      });
      tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: 1 }, 0);
      nodes.forEach((node, i) => {
        tl.to(
          node,
          { backgroundColor: '#3ED5BB', borderColor: '#3ED5BB', duration: 0.04 },
          0.18 + i * 0.38,
        );
      });
    }, rail);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section id="how" className="relative py-24 lg:py-32">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="mx-auto max-w-wrap px-5 sm:px-8">
        <SectionIntro
          index="05"
          label="How it works"
          title="Set it up once. Never think about it."
        />

        <div ref={railRef} className="mt-16 lg:mt-20">
          {/* Timeline rail */}
          <div className="relative mb-12 hidden md:block">
            <div className="h-px w-full bg-white/[0.08]" />
            <div
              ref={lineRef}
              className="absolute inset-x-0 top-0 h-px origin-left bg-brand-300"
              style={{ transform: 'scaleX(0)' }}
            />
            <div className="absolute inset-x-0 top-0 grid grid-cols-3">
              {STEPS.map((s) => (
                <span
                  key={s.n}
                  data-step-node
                  className="-mt-[5px] h-[11px] w-[11px] rounded-full border border-white/25 bg-ink-900"
                />
              ))}
            </div>
          </div>

          <motion.div
            className="grid gap-12 md:grid-cols-3 md:gap-8"
            variants={reduced ? undefined : gridVariants}
            initial={reduced ? undefined : 'hidden'}
            whileInView={reduced ? undefined : 'show'}
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
          >
            {STEPS.map((s) => (
              <motion.div key={s.n} variants={reduced ? undefined : stepVariants}>
                <span className="ghost-num">{s.n}</span>
                <h3 className="display-md mt-5 max-w-[16ch] text-paper-900">{s.title}</h3>
                <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-paper-400">{s.sub}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
