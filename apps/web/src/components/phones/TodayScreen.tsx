'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Crest, Overline, SPORT, TabBar, UpcomingPill, type SportKey } from './shared';

const TEAMS = [
  { code: 'PSG', label: 'PSG' },
  { code: 'ATM', label: 'ATM' },
  { code: 'RMA', label: 'RMA' },
  { code: 'BAR', label: 'BAR' },
  { code: 'MUN', label: 'MUN' },
] as const;

type UpcomingEvent = {
  sport: SportKey;
  sportLabel: string;
  league: string;
  stage: string;
  home?: string;
  homeCode?: string;
  away?: string;
  awayCode?: string;
  title?: string;
  time: string;
  venue: string;
  countdown: string;
};

const UPCOMING: UpcomingEvent[] = [
  {
    sport: 'football',
    sportLabel: 'Football',
    league: 'La Liga',
    stage: 'Scheduled',
    home: 'Atlético Ma...',
    homeCode: 'ATM',
    away: 'Málaga',
    awayCode: 'MAL',
    time: '12:30 AM',
    venue: 'Riyadh Air Metropolitano',
    countdown: 'in 9d',
  },
  {
    sport: 'f1',
    sportLabel: 'F1',
    league: 'Formula 1',
    stage: 'Practice',
    title: 'Formula 1',
    time: '4:00 PM',
    venue: 'Zandvoort',
    countdown: 'in 11d',
  },
  {
    sport: 'f1',
    sportLabel: 'F1',
    league: 'Formula 1',
    stage: 'Qualifying',
    title: 'Formula 1',
    time: '8:00 PM',
    venue: 'Zandvoort',
    countdown: 'in 11d',
  },
  {
    sport: 'football',
    sportLabel: 'Football',
    league: 'Premier League',
    stage: 'Scheduled',
    home: 'Hull City',
    homeCode: 'HUL',
    away: 'Man United',
    awayCode: 'MUN',
    time: '5:00 PM',
    venue: 'MKM Stadium',
    countdown: 'in 12d',
  },
  {
    sport: 'cricket',
    sportLabel: 'Cricket',
    league: 'Test Series',
    stage: 'Day 1',
    home: 'India A',
    homeCode: 'IND',
    away: 'Australia A',
    awayCode: 'AUS',
    time: '9:30 AM',
    venue: 'Chennai',
    countdown: 'in 14d',
  },
];

/** Live Today screen — the list really scrolls, cards lift, countdowns pulse. */
export function TodayScreen() {
  return (
    <div className="flex h-full flex-col bg-[#05070A] text-paper-900">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-lenis-prevent
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-paper-300">
          Good morning
        </span>
        <h3 className="font-display text-[26px] font-bold leading-tight">Today</h3>
        <p className="text-[10px] text-paper-400">Monday, 10 August</p>

        <div className="mt-4">
          <Overline right="6">Your teams</Overline>
          <div className="mt-2.5 flex gap-3">
            {TEAMS.map((t) => (
              <motion.span
                key={t.code}
                className="flex flex-col items-center gap-1"
                whileHover={{ y: -2 }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-[#11171A]">
                  <Crest code={t.code} size={28} />
                </span>
                <span className="text-[7.5px] font-semibold tracking-wider text-paper-300">
                  {t.label}
                </span>
              </motion.span>
            ))}
          </div>
        </div>

        <p className="mt-4 text-[10.5px] leading-relaxed text-paper-400">
          Nothing on today. Here&apos;s what&apos;s coming up for what you follow.
        </p>

        <div className="mt-4 pb-4">
          <Overline right={UPCOMING.length}>Coming up</Overline>
          <div className="mt-2.5 space-y-3">
            {UPCOMING.map((e, i) => (
              <UpcomingCard key={`${e.league}-${e.stage}-${i}`} event={e} index={i} />
            ))}
          </div>
        </div>
      </div>
      <TabBar active="today" />
    </div>
  );
}

function UpcomingCard({ event, index }: { event: UpcomingEvent; index: number }) {
  const color = SPORT[event.sport];

  return (
    <motion.article
      className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D1214]"
      whileHover={{ scale: 1.025, boxShadow: '0 12px 32px -12px rgba(0,0,0,0.75)' }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
        style={{ background: color }}
        aria-hidden
      />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-paper-400">
            <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: color }} />
            <span style={{ color }}>{event.sportLabel}</span>
            <span className="text-paper-300">· {event.league} · {event.stage}</span>
          </span>
          <UpcomingPill />
        </div>

        {event.home ? (
          <div className="mt-3 flex items-center justify-around">
            <span className="flex w-[38%] flex-col items-center gap-1.5">
              <Crest code={event.homeCode!} size={30} />
              <span className="max-w-full truncate text-[10px] font-semibold">{event.home}</span>
            </span>
            <span className="text-[9px] font-bold tracking-widest text-paper-300">VS</span>
            <span className="flex w-[38%] flex-col items-center gap-1.5">
              <Crest code={event.awayCode!} size={30} />
              <span className="max-w-full truncate text-[10px] font-semibold">{event.away}</span>
            </span>
          </div>
        ) : (
          <h4 className="mt-2.5 font-display text-[14px] font-bold">{event.title}</h4>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="truncate text-[9px] text-paper-400">
            {event.time} · {event.venue}
          </span>
          <Countdown value={event.countdown} index={index} />
        </div>
      </div>
    </motion.article>
  );
}

/** Pulses once on mount (staggered per card), then softly every few seconds. */
function Countdown({ value, index }: { value: string; index: number }) {
  const reduced = useReducedMotion();

  return (
    <motion.span
      className="shrink-0 text-[10.5px] font-bold text-paper-900"
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={
        reduced
          ? { opacity: 1 }
          : { scale: [0.6, 1.18, 1], opacity: [0, 1, 1], color: ['#3ED5BB', '#3ED5BB', '#F5F7FA'] }
      }
      transition={{ duration: 0.7, delay: 0.35 + index * 0.12, ease: 'easeOut' }}
    >
      <motion.span
        className="inline-block"
        animate={reduced ? undefined : { opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 4.5, delay: index * 0.8 }}
      >
        {value}
      </motion.span>
    </motion.span>
  );
}
