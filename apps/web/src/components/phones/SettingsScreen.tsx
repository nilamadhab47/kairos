'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { SPORT, TabBar, type SportKey } from './shared';

type FollowGroup = {
  id: SportKey;
  label: string;
  icon: React.ReactNode;
  follows: string[];
};

const GROUPS: FollowGroup[] = [
  {
    id: 'football',
    label: 'Football',
    icon: <BallIcon color={SPORT.football} />,
    follows: [
      'Premier League',
      'La Liga',
      'UEFA Champions League',
      'UEFA Europa League',
      'Barcelona',
      'Manchester United',
      'Atlético Madrid',
      'Paris Saint-Germain',
      'Real Madrid',
    ],
  },
  {
    id: 'cricket',
    label: 'Cricket',
    icon: <BatIcon color={SPORT.cricket} />,
    follows: ['India A'],
  },
  {
    id: 'f1',
    label: 'Formula 1',
    icon: <FlagIcon color={SPORT.f1} />,
    follows: ['Formula 1'],
  },
];

/** Live Settings screen — groups really expand/collapse, chips have press states. */
export function SettingsScreen() {
  const [open, setOpen] = useState<Record<string, boolean>>({
    football: true,
    cricket: true,
    f1: true,
  });
  const [muted, setMuted] = useState<Record<string, boolean>>({});

  return (
    <div className="flex h-full flex-col bg-[#05070A] text-paper-900">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-lenis-prevent
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-paper-300">
          Account
        </span>
        <h3 className="font-display text-[26px] font-bold leading-tight">Settings</h3>

        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#0D1214] p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#161C20] text-[11px] font-bold">
            MA
          </span>
          <span className="min-w-0">
            <span className="block text-[11.5px] font-semibold">Maya</span>
            <span className="block truncate text-[9.5px] text-paper-400">maya@example.com</span>
            <span className="block text-[8.5px] text-paper-300">Asia/Kolkata</span>
          </span>
          <span className="ml-auto text-paper-300">
            <Chevron />
          </span>
        </div>

        <div className="mt-4 pb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-paper-300">
            Your follows
          </span>
          <div className="mt-2.5 divide-y divide-white/[0.05] rounded-2xl border border-white/[0.07] bg-[#0D1214]">
            {GROUPS.map((g) => (
              <FollowGroupRow
                key={g.id}
                group={g}
                open={!!open[g.id]}
                onToggle={() => setOpen((s) => ({ ...s, [g.id]: !s[g.id] }))}
                muted={muted}
                onChip={(name) => setMuted((s) => ({ ...s, [name]: !s[name] }))}
              />
            ))}
          </div>
        </div>
      </div>
      <TabBar active="settings" />
    </div>
  );
}

function FollowGroupRow({
  group,
  open,
  onToggle,
  muted,
  onChip,
}: {
  group: FollowGroup;
  open: boolean;
  onToggle: () => void;
  muted: Record<string, boolean>;
  onChip: (name: string) => void;
}) {
  const n = group.follows.length;

  return (
    <div className="px-3 py-3">
      <button type="button" className="flex w-full items-center gap-2.5" onClick={onToggle}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-[#11171A]">
          {group.icon}
        </span>
        <span className="text-[12px] font-bold">{group.label}</span>
        <span className="ml-auto text-[9px] text-paper-400">
          {n} {n === 1 ? 'follow' : 'follows'}
        </span>
        <motion.span
          className="text-paper-300"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          <Chevron />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 pt-2.5">
              {group.follows.map((name, i) => {
                const off = !!muted[name];
                return (
                  <motion.button
                    key={name}
                    type="button"
                    onClick={() => onChip(name)}
                    className="rounded-full border px-2.5 py-1 text-[9px] font-semibold"
                    style={{
                      borderColor: off ? 'rgba(245,247,250,0.06)' : 'rgba(245,247,250,0.14)',
                      color: off ? '#4C5162' : '#F5F7FA',
                      background: off ? 'transparent' : 'rgba(245,247,250,0.04)',
                      textDecoration: off ? 'line-through' : 'none',
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, type: 'spring', stiffness: 320, damping: 24 }}
                    whileTap={{ scale: 0.88 }}
                    whileHover={{ scale: 1.05 }}
                  >
                    {name}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9,5 16,12 9,19" />
    </svg>
  );
}

function BallIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v4.5L8 10l1.5 4.5h5L16 10l-4-2.5M4 14l4 0.5M20 14l-4 0.5M8.5 20.5 10 17M15.5 20.5 14 17" strokeWidth="1.4" />
    </svg>
  );
}

function BatIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M5 19 15.5 8.5" />
      <path d="m14 5 5 5" strokeWidth="3" />
      <circle cx="7" cy="7" r="2" />
    </svg>
  );
}

function FlagIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </svg>
  );
}
