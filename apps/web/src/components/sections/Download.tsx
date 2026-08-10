'use client';

import { ClipReveal } from '../ClipReveal';
import { Magnetic } from '../Magnetic';
import { StoreButtons } from '../StoreButtons';
import { motion, useReducedMotion } from 'framer-motion';

export function Download() {
  const reduced = useReducedMotion();

  return (
    <section id="download" className="relative overflow-hidden py-28 lg:py-40">
      <div className="hairline absolute inset-x-0 top-0" />
      <div
        className="glow bottom-[-30%] left-1/2 h-[520px] w-[720px] -translate-x-1/2"
        style={{ background: 'rgba(62, 213, 187, 0.1)' }}
      />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        {/* Trigger lives on the unclipped h2; the masked lines animate via variants. */}
        <motion.h2
          className="display-xl text-paper-900"
          initial={reduced ? undefined : 'hidden'}
          whileInView={reduced ? undefined : 'show'}
          viewport={{ once: true, margin: '0px 0px -20% 0px' }}
        >
          {(
            [
              ['line-1', <span key="t">Be there for</span>],
              // The emotional closing beat — slow gradient sweep through the accent line.
              ['line-2', <span key="b" className="text-sweep">your moments.</span>],
            ] as const
          ).map(([key, line], i) => (
            <span key={key} className="block overflow-hidden">
              <motion.span
                className="block"
                variants={{
                  hidden: { y: '110%' },
                  show: {
                    y: '0%',
                    transition: { duration: 0.85, delay: i * 0.09, ease: [0.2, 0.75, 0.2, 1] },
                  },
                }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </motion.h2>
        <ClipReveal delay={0.15}>
          <p className="lede mx-auto mt-6 max-w-md">
            Kairos is coming soon to the App Store and Google Play. Want in before everyone else?
          </p>
        </ClipReveal>
        <ClipReveal delay={0.25}>
          <div className="mt-9 flex flex-col items-center gap-5">
            <StoreButtons magnetic className="justify-center" />
            <Magnetic strength={12}>
              <a
                href="mailto:nilamadhab47@gmail.com?subject=Kairos%20early%20access"
                className="btn-primary"
              >
                Request early access
              </a>
            </Magnetic>
          </div>
        </ClipReveal>
      </div>
    </section>
  );
}
