'use client';

import type { ReactNode } from 'react';

/* Sport accent colors — same tokens as the mobile app. */
export const SPORT = {
  football: '#5AA7FF',
  f1: '#F16060',
  cricket: '#3EC28B',
} as const;

export type SportKey = keyof typeof SPORT;

export function Overline({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-paper-300">
        {children}
      </span>
      {right != null && <span className="text-[10px] font-semibold text-paper-300">{right}</span>}
    </div>
  );
}

export function UpcomingPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-[3px] text-[7.5px] font-bold uppercase tracking-[0.12em] text-paper-400">
      <span className="h-1 w-1 rounded-full bg-paper-400" />
      Upcoming
    </span>
  );
}

const CREST: Record<string, { bg: string; fg: string }> = {
  PSG: { bg: 'linear-gradient(135deg, #1B3B8B, #C8102E)', fg: '#fff' },
  ATM: { bg: 'linear-gradient(135deg, #CB3524, #F5F7FA)', fg: '#1B3B8B' },
  RMA: { bg: 'linear-gradient(135deg, #F5F7FA, #FEBE10)', fg: '#00529F' },
  BAR: { bg: 'linear-gradient(135deg, #A50044, #004D98)', fg: '#EDBB00' },
  MUN: { bg: 'linear-gradient(135deg, #DA291C, #6E1710)', fg: '#FBE122' },
  MAL: { bg: 'linear-gradient(135deg, #2E6FB2, #9AC1E4)', fg: '#fff' },
  HUL: { bg: 'linear-gradient(135deg, #F5A12E, #101010)', fg: '#fff' },
  IND: { bg: 'linear-gradient(135deg, #1F6FEB, #0B3D91)', fg: '#F6B84B' },
  AUS: { bg: 'linear-gradient(135deg, #FFCD00, #00843D)', fg: '#00843D' },
};

export function Crest({ code, size = 26 }: { code: string; size?: number }) {
  const c = CREST[code] ?? { bg: 'linear-gradient(135deg, #3A434B, #161C20)', fg: '#F5F7FA' };
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold"
      style={{
        width: size,
        height: size,
        background: c.bg,
        color: c.fg,
        fontSize: size * 0.34,
        letterSpacing: 0.5,
        boxShadow: 'inset 0 0 0 1.5px rgba(5,7,10,0.55)',
      }}
      aria-hidden
    >
      {code.slice(0, 3)}
    </span>
  );
}

export function TabBar({ active }: { active: 'today' | 'calendar' | 'alerts' | 'settings' }) {
  const tabs = [
    { id: 'today', label: 'Today', icon: <TabClock /> },
    { id: 'calendar', label: 'Calendar', icon: <TabCalendar /> },
    { id: 'alerts', label: 'Alerts', icon: <TabBell /> },
    { id: 'settings', label: 'Settings', icon: <TabSun /> },
  ] as const;

  return (
    <div className="mt-auto flex items-start justify-around border-t border-white/[0.06] bg-[#05070A]/95 px-2 pb-5 pt-2.5">
      {tabs.map((t) => (
        <span
          key={t.id}
          className="flex flex-col items-center gap-1"
          style={{ color: t.id === active ? '#3ED5BB' : '#6E7488' }}
        >
          {t.icon}
          <span className="text-[8px] font-medium">{t.label}</span>
        </span>
      ))}
    </div>
  );
}

function tabIcon() {
  return {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
}

function TabClock() {
  return (
    <svg {...tabIcon()} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12,7 12,12 15.5,14" />
    </svg>
  );
}

function TabCalendar() {
  return (
    <svg {...tabIcon()} aria-hidden>
      <rect x="3" y="4.5" width="18" height="17" rx="3" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
    </svg>
  );
}

function TabBell() {
  return (
    <svg {...tabIcon()} aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function TabSun() {
  return (
    <svg {...tabIcon()} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </svg>
  );
}
