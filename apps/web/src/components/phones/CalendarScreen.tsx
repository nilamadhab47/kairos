'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Crest, SPORT, TabBar, UpcomingPill, type SportKey } from './shared';

type CalEvent = {
  id: string;
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

type CalDay = { day: string; events: CalEvent[] };

const DAYS: CalDay[] = [
  {
    day: 'Thursday, 20 August',
    events: [
      {
        id: 'atm-mal',
        sport: 'football',
        sportLabel: 'Football',
        league: 'La Liga',
        stage: 'Scheduled',
        home: 'Atlético Madrid',
        homeCode: 'ATM',
        away: 'Málaga',
        awayCode: 'MAL',
        time: '12:30 AM',
        venue: 'Riyadh Air Metropolitano',
        countdown: 'in 9d',
      },
    ],
  },
  {
    day: 'Friday, 21 August',
    events: [
      {
        id: 'f1-fp',
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
        id: 'f1-q',
        sport: 'f1',
        sportLabel: 'F1',
        league: 'Formula 1',
        stage: 'Qualifying',
        title: 'Formula 1',
        time: '8:00 PM',
        venue: 'Zandvoort',
        countdown: 'in 11d',
      },
    ],
  },
  {
    day: 'Saturday, 22 August',
    events: [
      {
        id: 'f1-race',
        sport: 'f1',
        sportLabel: 'F1',
        league: 'Formula 1',
        stage: 'Race',
        title: 'Formula 1',
        time: '3:30 PM',
        venue: 'Zandvoort',
        countdown: 'in 12d',
      },
      {
        id: 'hul-mun',
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
    ],
  },
  {
    day: 'Monday, 24 August',
    events: [
      {
        id: 'ind-aus',
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
    ],
  },
];

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'football', label: 'Football' },
  { id: 'cricket', label: 'Cricket' },
  { id: 'f1', label: 'Formula 1' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

/** Live Calendar screen — the filter chips really filter, with staggered layout animation. */
export function CalendarScreen() {
  const [filter, setFilter] = useState<FilterId>('all');

  const visibleDays = DAYS.map((d) => ({
    ...d,
    events: d.events.filter((e) => filter === 'all' || e.sport === filter),
  })).filter((d) => d.events.length > 0);

  const total = visibleDays.reduce((n, d) => n + d.events.length, 0);

  return (
    <div className="flex h-full flex-col bg-[#05070A] text-paper-900">
      <div className="px-4 pt-14">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-paper-300">
          Calendar
        </span>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[26px] font-bold leading-tight">August 2026</h3>
          <span className="h-5 w-9 rounded-full bg-[#161C20] p-[3px]" aria-hidden>
            <span className="block h-full w-[14px] rounded-full bg-[#3A434B]" />
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-2">
            <NavArrow dir="left" />
            <NavArrow dir="right" />
          </div>
          <motion.span
            key={total}
            className="text-[10px] font-medium text-paper-400"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {total} {total === 1 ? 'event' : 'events'}
          </motion.span>
        </div>

        <div className="mt-3 flex gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <motion.button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="rounded-full border px-2.5 py-1.5 text-[9px] font-semibold"
                style={{
                  borderColor: active ? 'rgba(62,213,187,0.6)' : 'rgba(245,247,250,0.1)',
                  color: active ? '#3ED5BB' : '#8B93A7',
                  background: active ? 'rgba(62,213,187,0.08)' : 'rgba(245,247,250,0.03)',
                }}
                whileTap={{ scale: 0.92 }}
                whileHover={{ y: -1 }}
              >
                {f.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div
        className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-lenis-prevent
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleDays.map((d) => (
            <motion.section
              key={d.day}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="mb-4"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-paper-300">
                  {d.day}
                </span>
                <span className="text-[9px] text-paper-300">
                  {d.events.length} {d.events.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              <div className="mt-2 space-y-2.5">
                <AnimatePresence mode="popLayout" initial={false}>
                  {d.events.map((e, i) => (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -6 }}
                      transition={{
                        type: 'spring',
                        stiffness: 320,
                        damping: 26,
                        delay: i * 0.05,
                      }}
                    >
                      <CalendarCard event={e} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>

      <TabBar active="calendar" />
    </div>
  );
}

function CalendarCard({ event }: { event: CalEvent }) {
  const color = SPORT[event.sport];

  return (
    <motion.article
      className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D1214] p-3"
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
        style={{ background: color }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.12em]">
          <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: color }} />
          <span style={{ color }}>{event.sportLabel}</span>
          <span className="text-paper-300">· {event.league} · {event.stage}</span>
        </span>
        <UpcomingPill />
      </div>

      {event.home ? (
        <div className="mt-2.5 flex items-center gap-2">
          <Crest code={event.homeCode!} size={22} />
          <span className="text-[10.5px] font-semibold">{event.home}</span>
          <span className="text-[8px] font-bold tracking-widest text-paper-300">VS</span>
          <Crest code={event.awayCode!} size={22} />
          <span className="text-[10.5px] font-semibold">{event.away}</span>
        </div>
      ) : (
        <h4 className="mt-2 font-display text-[13px] font-bold">{event.title}</h4>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <span className="truncate text-[9px] text-paper-400">
          {event.time} · {event.venue}
        </span>
        <span className="shrink-0 text-[10px] font-bold">{event.countdown}</span>
      </div>
    </motion.article>
  );
}

function NavArrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <motion.span
      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#11171A] text-paper-600"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === 'left' ? <polyline points="15,5 8,12 15,19" /> : <polyline points="9,5 16,12 9,19" />}
      </svg>
    </motion.span>
  );
}
