'use client';

import { motion, type Variants } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { SectionIntro } from '../SectionIntro';

const FEATURES = [
  {
    n: '01',
    title: 'Today, at a glance',
    sub: "One screen with your teams and everything coming up. If there's nothing on, it says so — and leaves you alone.",
    icon: <ClockIcon />,
  },
  {
    n: '02',
    title: 'Nudges, not noise',
    sub: 'A push 15, 30 or 60 minutes before the whistle — you pick. Quiet nights pauses reminders while you sleep.',
    icon: <BellIcon />,
  },
  {
    n: '03',
    title: 'Teams, not feeds',
    sub: 'Follow clubs, national sides, whole leagues or an entire race series. No comments, no takes, no spoilers.',
    icon: <HeartIcon />,
  },
  {
    n: '04',
    title: 'Every sport, one calendar',
    sub: 'Premier League on Saturday, the Grand Prix on Sunday, the Test match all week — mapped together, weeks ahead.',
    icon: <CalendarIcon />,
  },
] as const;

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 180, damping: 24 } },
};

export function Features() {
  const reduced = usePrefersReducedMotion();

  return (
    <section id="features" className="relative py-24 lg:py-32">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="mx-auto max-w-wrap px-5 sm:px-8">
        <SectionIntro index="03" label="Features" title="Small app. Sharp edges." />

        <motion.div
          className="mt-16 border-t border-white/[0.07]"
          variants={reduced ? undefined : listVariants}
          initial={reduced ? undefined : 'hidden'}
          whileInView={reduced ? undefined : 'show'}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        >
          {FEATURES.map((f) => (
            <motion.div key={f.n} variants={reduced ? undefined : rowVariants}>
              <FeatureRow feature={f} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FeatureRow({ feature }: { feature: (typeof FEATURES)[number] }) {
  return (
    <motion.div
      className="group grid items-center gap-x-8 gap-y-3 border-b border-white/[0.07] py-9 md:grid-cols-[minmax(80px,140px)_1.2fr_1fr_56px] lg:py-12"
      initial="rest"
      whileHover="hover"
      data-cursor
    >
      <span className="ghost-num transition-colors duration-300 group-hover:text-brand-300/90 md:group-hover:[-webkit-text-stroke-color:transparent]">
        {feature.n}
      </span>
      <h3 className="display-md text-paper-900 transition-transform duration-300 md:group-hover:translate-x-2">
        {feature.title}
      </h3>
      <p className="text-[15px] leading-relaxed text-paper-400">{feature.sub}</p>
      <span className="hidden h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] text-brand-300 transition-colors duration-300 group-hover:border-brand-300/40 group-hover:bg-brand-300/10 md:inline-flex">
        {feature.icon}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons with hover micro-animations (driven by the row's hover state)  */
/* ------------------------------------------------------------------ */

function iconProps() {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
}

const svgOrigin = (x: number, y: number) =>
  ({ transformBox: 'view-box', transformOrigin: `${x}px ${y}px` }) as const;

/** Minute hand ticks around the dial on hover. */
function ClockIcon() {
  return (
    <svg {...iconProps()} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <motion.g
        style={svgOrigin(12, 12)}
        variants={{
          rest: { rotate: 0 },
          hover: {
            rotate: 360,
            transition: { duration: 1.1, ease: [0.65, 0, 0.35, 1] },
          },
        }}
      >
        <line x1="12" y1="12" x2="12" y2="7.5" />
      </motion.g>
      <line x1="12" y1="12" x2="15" y2="13.6" />
    </svg>
  );
}

/** Bell swings from its crown on hover. */
function BellIcon() {
  return (
    <svg {...iconProps()} aria-hidden>
      <motion.g
        style={svgOrigin(12, 3)}
        variants={{
          rest: { rotate: 0 },
          hover: {
            rotate: [0, -16, 12, -7, 3, 0],
            transition: { duration: 0.9, ease: 'easeInOut' },
          },
        }}
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </motion.g>
    </svg>
  );
}

/** Heart beats twice on hover. */
function HeartIcon() {
  return (
    <svg {...iconProps()} aria-hidden>
      <motion.path
        d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 1 1 7.5-6.6 5 5 0 1 1 7.5 6.6"
        style={svgOrigin(12, 12)}
        variants={{
          rest: { scale: 1 },
          hover: {
            scale: [1, 1.18, 1, 1.12, 1],
            transition: { duration: 0.8, ease: 'easeInOut' },
          },
        }}
      />
    </svg>
  );
}

/** Page corner flips over on hover. */
function CalendarIcon() {
  return (
    <svg {...iconProps()} aria-hidden>
      <rect x="3" y="4.5" width="18" height="17" rx="3" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
      <motion.path
        d="M15.5 21.5 21 16"
        style={svgOrigin(21, 21.5)}
        variants={{
          rest: { rotate: 0, opacity: 0.6 },
          hover: {
            rotate: [0, -38, 0],
            opacity: [0.6, 1, 0.6],
            transition: { duration: 0.75, ease: 'easeInOut' },
          },
        }}
      />
    </svg>
  );
}
