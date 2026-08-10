'use client';

import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from '@/lib/gsap';
import { useDesktopPointer, usePrefersReducedMotion } from '@/lib/hooks';
import { SectionIntro } from '../SectionIntro';
import { DeviceFrame } from '../phones/DeviceFrame';
import { TodayScreen } from '../phones/TodayScreen';
import { CalendarScreen } from '../phones/CalendarScreen';
import { SettingsScreen } from '../phones/SettingsScreen';

const SLIDES = [
  {
    id: 'today',
    label: 'Today',
    title: 'Every moment, in focus',
    sub: 'Tap any event for kickoff time, venue and a live countdown.',
    screen: <TodayScreen />,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    title: 'Your month, mapped',
    sub: 'Every fixture you follow — football, cricket, F1 — on one calendar.',
    screen: <CalendarScreen />,
  },
  {
    id: 'settings',
    label: 'Follows',
    title: 'Follow what you love',
    sub: 'Leagues, clubs, national sides, constructors. Nothing else.',
    screen: <SettingsScreen />,
  },
] as const;

/**
 * The pinned three-phone section. On desktop the section pins and scrubbing
 * hands focus from Today → Calendar → Settings with a 3D rotate-away.
 * On touch/reduced-motion it degrades to sequential stacked reveals.
 */
export function PhoneShowcase() {
  const desktop = useDesktopPointer();
  const reduced = usePrefersReducedMotion();
  const pinned = desktop && !reduced;

  return (
    <section id="product" className="relative">
      <div className="mx-auto max-w-wrap px-5 pt-24 sm:px-8 lg:pt-32">
        <SectionIntro
          index="01"
          label="The product"
          title="One quiet timeline. Zero doomscroll."
          lede={
            <>Open Kairos and see exactly one thing: what&apos;s coming up for what you follow.</>
          }
        />
      </div>
      {pinned ? <PinnedStage /> : <StackedStage />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop: pinned scrub choreography                                   */
/* ------------------------------------------------------------------ */

function PinnedStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const ctx = gsap.context(() => {
      const phones = gsap.utils.toArray<HTMLElement>('[data-slide-phone]', wrap);
      const captions = gsap.utils.toArray<HTMLElement>('[data-slide-caption]', wrap);

      // Offstage initial state for slides 2 and 3.
      phones.slice(1).forEach((p) => {
        gsap.set(p, { xPercent: 50, rotationY: -34, opacity: 0, scale: 0.9 });
      });
      captions.slice(1).forEach((c) => {
        gsap.set(c, { opacity: 0, y: 48 });
      });

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: wrap,
          start: 'top top',
          end: '+=280%',
          scrub: 0.65,
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            const idx = self.progress < 0.36 ? 0 : self.progress < 0.72 ? 1 : 2;
            setActive((prev) => (prev === idx ? prev : idx));
          },
        },
      });

      const handoff = (from: number, to: number, label: string) => {
        const fromPhone = phones[from];
        const toPhone = phones[to];
        const fromCap = captions[from];
        const toCap = captions[to];
        if (!fromPhone || !toPhone || !fromCap || !toCap) return;
        tl.addLabel(label)
          .to(fromPhone, { xPercent: -42, rotationY: 34, opacity: 0, scale: 0.88, duration: 1 }, label)
          .to(fromCap, { opacity: 0, y: -36, duration: 0.55 }, label)
          .to(
            toPhone,
            { xPercent: 0, rotationY: 0, opacity: 1, scale: 1, duration: 1 },
            `${label}+=0.18`,
          )
          .to(toCap, { opacity: 1, y: 0, duration: 0.55 }, `${label}+=0.5`);
      };

      tl.to({}, { duration: 0.55 }); // dwell on Today
      handoff(0, 1, 'h1');
      tl.to({}, { duration: 0.55 }); // dwell on Calendar
      handoff(1, 2, 'h2');
      tl.to({}, { duration: 0.6 }); // dwell on Settings
    }, wrap);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex h-screen items-center" style={{ perspective: '1400px' }}>
        <div className="relative mx-auto h-full w-full max-w-wrap px-8">
          {SLIDES.map((s, i) => (
            <div
              key={s.id}
              className="absolute inset-0 grid grid-cols-[1.05fr_0.95fr] items-center gap-12"
              style={{ pointerEvents: active === i ? 'auto' : 'none' }}
            >
              <div data-slide-caption className="max-w-lg">
                <span className="index-num text-[15px]">
                  0{i + 1} <span className="text-paper-300">/ 03</span>
                </span>
                <h3 className="display-lg mt-5 text-paper-900">{s.title}</h3>
                <p className="lede mt-5 max-w-md">{s.sub}</p>
              </div>
              <div
                data-slide-phone
                className="justify-self-center will-change-transform"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <DeviceFrame width={295}>{s.screen}</DeviceFrame>
              </div>
            </div>
          ))}

          {/* Step rail — mirrors scrub progress so the visitor always knows where they are */}
          <div className="absolute bottom-10 left-8 right-8 flex gap-8">
            {SLIDES.map((s, i) => (
              <div key={s.id} className="flex-1">
                <div className="h-px w-full overflow-hidden bg-white/[0.08]">
                  <div
                    className="h-full bg-brand-300 transition-transform duration-500 ease-out"
                    style={{
                      transform: `scaleX(${active >= i ? 1 : 0})`,
                      transformOrigin: 'left',
                    }}
                  />
                </div>
                <span
                  className="mt-3 block text-[11px] font-bold uppercase tracking-[0.18em] transition-colors duration-300"
                  style={{ color: active === i ? '#F5F7FA' : '#6E7488' }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile / reduced-motion: sequential stacked reveals                  */
/* ------------------------------------------------------------------ */

function StackedStage() {
  return (
    <div className="mx-auto max-w-wrap space-y-20 px-5 py-16 sm:px-8">
      {SLIDES.map((s, i) => (
        <motion.div
          key={s.id}
          className="flex flex-col items-center gap-8"
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '0px 0px -12% 0px' }}
          transition={{ duration: 0.7, ease: [0.2, 0.65, 0.25, 1] }}
        >
          <DeviceFrame width={272}>{s.screen}</DeviceFrame>
          <div className="max-w-sm text-center">
            <span className="index-num">
              0{i + 1} <span className="text-paper-300">/ 03</span>
            </span>
            <h3 className="display-md mt-3 text-paper-900">{s.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-paper-400">{s.sub}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
