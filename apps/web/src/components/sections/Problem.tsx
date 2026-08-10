'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ClipReveal } from '../ClipReveal';

export function Problem() {
  return (
    <section className="relative py-24 lg:py-32">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="mx-auto grid max-w-wrap gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <ClipReveal>
          <div className="index-row">
            <span className="index-num">02</span>
            <span className="index-rule" />
            <span className="index-label">The problem</span>
          </div>
          <h2 className="display-lg mt-8 text-paper-900">
            Sports apps are built for everyone. That&apos;s the problem.
          </h2>
        </ClipReveal>

        <div className="space-y-6 lg:pt-14">
          <ClipReveal delay={0.05}>
            <p className="lede">
              Scores for every league. News about every transfer. Notifications about matches you
              don&apos;t care about — and silence before the ones you do.
            </p>
          </ClipReveal>
          <ClipReveal delay={0.1}>
            <p className="lede">
              You follow a handful of teams. You want to know one thing: <QuestionLine />
            </p>
          </ClipReveal>
          <ClipReveal delay={0.15}>
            <p className="lede">
              Kairos is that answer, and nothing more. It&apos;s quiet until it matters — then it
              taps you on the shoulder, right on time.
            </p>
          </ClipReveal>
        </div>
      </div>
    </section>
  );
}

/** The load-bearing line: color-shifts up and draws its own teal underline. */
function QuestionLine() {
  const reduced = useReducedMotion();

  return (
    <motion.span
      className="relative inline"
      initial={reduced ? false : { color: '#8B93A7' }}
      whileInView={{ color: '#F5F7FA' }}
      viewport={{ once: true, amount: 0.9 }}
      transition={{ duration: 0.9, delay: 0.35 }}
    >
      when do they play, and will I be there for it?
      <svg
        className="absolute -bottom-1.5 left-0 w-full"
        height="6"
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        aria-hidden
      >
        <motion.path
          d="M1 4.5 Q 30 2 55 3.5 T 99 3"
          fill="none"
          stroke="#3ED5BB"
          strokeWidth="1.6"
          strokeLinecap="round"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.9 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.2, 0.65, 0.25, 1] }}
        />
      </svg>
    </motion.span>
  );
}
