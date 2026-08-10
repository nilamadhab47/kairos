'use client';

import { motion, type Variants } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { SectionIntro } from '../SectionIntro';

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 180, damping: 22 } },
};

export function EarlyAccess() {
  const reduced = usePrefersReducedMotion();

  return (
    <section className="relative py-24 lg:py-32">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="mx-auto max-w-wrap px-5 sm:px-8">
        <SectionIntro
          index="06"
          label="Early access"
          align="center"
          title="In private beta right now."
          lede="A small group of fans is already living on Kairos time. Their verdicts land here soon."
        />

        <motion.div
          className="mt-14 grid gap-5 md:grid-cols-3"
          variants={reduced ? undefined : gridVariants}
          initial={reduced ? undefined : 'hidden'}
          whileInView={reduced ? undefined : 'show'}
          viewport={{ once: true, margin: '0px 0px -12% 0px' }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div key={i} variants={reduced ? undefined : cardVariants}>
              {/* Intentional, branded pending state — teal-tinted sweep, not a gray pulse. */}
              <div className="card flex h-full flex-col p-8">
                <span aria-hidden className="font-display text-4xl leading-none text-brand-300/40">
                  &ldquo;
                </span>
                <div className="mt-4 space-y-2.5">
                  <div className="shimmer h-3 w-full rounded-full" style={{ animationDelay: `${i * 0.35}s` }} />
                  <div className="shimmer h-3 w-4/5 rounded-full" style={{ animationDelay: `${i * 0.35 + 0.1}s` }} />
                  <div className="shimmer h-3 w-3/5 rounded-full" style={{ animationDelay: `${i * 0.35 + 0.2}s` }} />
                </div>
                <div className="mt-8 flex items-center gap-3">
                  <span className="shimmer h-9 w-9 rounded-full" style={{ animationDelay: `${i * 0.35}s` }} />
                  <div className="space-y-1.5">
                    <div className="shimmer h-2.5 w-24 rounded-full" style={{ animationDelay: `${i * 0.35 + 0.15}s` }} />
                    <div className="shimmer h-2 w-16 rounded-full" style={{ animationDelay: `${i * 0.35 + 0.25}s` }} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
