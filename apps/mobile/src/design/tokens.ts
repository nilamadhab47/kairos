/**
 * Design tokens — single source of truth for colors, type, spacing, motion.
 * Consumed by the `theme` (adaptive), tailwind config, and primitives.
 *
 * Rules:
 * - Keep the palette restrained. Sport / team accents are additive slots.
 * - Every token has a purpose. No decorative colors.
 */

/**
 * "Obsidian Precision" palette — from the Stitch design system.
 * Deep obsidian layers, razor-thin borders, restrained neon accents.
 */
export const palette = {
  ink: {
    900: '#0A0E14', // canvas base — deep obsidian charcoal
    800: '#0A0E14', // page background
    700: '#111827', // layer 01 — section panels
    600: '#1A2230', // layer 02 — elevated cards
    500: '#1F2937', // layer 03 — modals / sheets
    400: '#1F2937',
    300: '#2E3B4E', // stroke subdued — 1px panel outlines
    200: '#374151', // stroke active — focus borders, dividers
    100: '#6B7280',
  },
  paper: {
    900: '#F9FAFB', // text high-contrast — scores, titles
    800: '#EDF0F5',
    700: '#DCE1EA',
    600: '#C2C9D6',
    500: '#A0A8B8',
    400: '#9CA3AF', // text medium — venues, team names
    300: '#6B7280', // text muted — timestamps, metadata
    200: '#4C5162',
    100: '#2A2E3B',
  },
  brand: {
    // electric mint cyan — the KAIROS signal accent
    50: '#E6FBF7',
    100: '#B7F3E5',
    200: '#62FAE3',
    300: '#2DD4BF',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0D9488',
    700: '#0F766E',
  },
  live: '#60A5FA', // electric match pulse (blue, per design)
  danger: '#EF4444',
  warn: '#F59E0B',
  success: '#2DD4BF',
  sport: {
    football: '#2DD4BF', // electric mint cyan
    f1: '#EF4444', // telemetry racing red
    cricket: '#F59E0B', // warm amber gold
    tennis: '#F0C247',
    basketball: '#F08A47',
    hockey: '#7C9CFF',
    baseball: '#B87CFF',
  } as const,
} as const;

/**
 * Font families — Space Grotesk for headers/scores/telemetry,
 * Inter for body and operational data. Loaded in the root layout.
 */
export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
  data: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export type SportKey = keyof typeof palette.sport;

export const radii = {
  xs: 6,
  sm: 8,
  btn: 12,
  card: 16,
  sheet: 24,
  pill: 999,
} as const;

/** 4pt spacing scale. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const typography = {
  display: { size: 34, lineHeight: 40, weight: '700' as const, tracking: -0.4, family: fonts.display },
  title: { size: 22, lineHeight: 28, weight: '600' as const, tracking: -0.2, family: fonts.displayMedium },
  subtitle: { size: 17, lineHeight: 24, weight: '600' as const, family: fonts.displayMedium },
  body: { size: 15, lineHeight: 22, weight: '400' as const, family: fonts.body },
  bodyStrong: { size: 15, lineHeight: 22, weight: '600' as const, family: fonts.bodySemiBold },
  caption: { size: 12, lineHeight: 16, weight: '500' as const, tracking: 0.2, family: fonts.bodyMedium },
  overline: { size: 11, lineHeight: 14, weight: '700' as const, tracking: 1.2, family: fonts.bodyBold },
  score: {
    size: 28,
    lineHeight: 32,
    weight: '700' as const,
    tracking: -0.4,
    variant: 'tabular-nums' as const,
    family: fonts.display,
  },
} as const;

export const motion = {
  duration: {
    instant: 90,
    fast: 140,
    base: 200,
    slow: 280,
    lazy: 400,
  },
  spring: {
    press: { damping: 18, stiffness: 320, mass: 0.6 },
    soft: { damping: 20, stiffness: 180, mass: 0.9 },
    sheet: { damping: 26, stiffness: 220, mass: 1 },
  },
  easing: {
    // used only where springs are inappropriate
    standard: [0.2, 0, 0, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
} as const;

export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
} as const;
