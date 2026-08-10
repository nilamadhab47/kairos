/**
 * Design tokens — single source of truth for colors, type, spacing, motion.
 * Consumed by the `theme` (adaptive), tailwind config, and primitives.
 *
 * Rules:
 * - Keep the palette restrained. Sport / team accents are additive slots.
 * - Every token has a purpose. No decorative colors.
 */

export const palette = {
  ink: {
    900: '#05070A',
    800: '#080B0D',
    700: '#0D1214',
    600: '#11171A',
    500: '#161C20',
    400: '#1E2429',
    300: '#252C31',
    200: '#3A434B',
    100: '#5A6470',
  },
  paper: {
    900: '#F5F7FA',
    800: '#EDF0F5',
    700: '#DCE1EA',
    600: '#C2C9D6',
    500: '#A0A8B8',
    400: '#8B93A7',
    300: '#6E7488',
    200: '#4C5162',
    100: '#2A2E3B',
  },
  brand: {
    // teal signal accent — chronograph feel
    50: '#E6FBF7',
    100: '#B7F3E5',
    200: '#7EE7CE',
    300: '#3ED5BB',
    400: '#2FBEA6',
    500: '#22A38C',
    600: '#178072',
    700: '#0F5E55',
  },
  live: '#34D399',
  danger: '#F87171',
  warn: '#F6B84B',
  success: '#34D399',
  sport: {
    football: '#5AA7FF',
    f1: '#F16060',
    cricket: '#3EC28B',
    tennis: '#F0C247',
    basketball: '#F08A47',
    hockey: '#7C9CFF',
    baseball: '#B87CFF',
  } as const,
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
  display: { size: 34, lineHeight: 40, weight: '700' as const, tracking: -0.4 },
  title: { size: 22, lineHeight: 28, weight: '600' as const, tracking: -0.2 },
  subtitle: { size: 17, lineHeight: 24, weight: '600' as const },
  body: { size: 15, lineHeight: 22, weight: '400' as const },
  bodyStrong: { size: 15, lineHeight: 22, weight: '600' as const },
  caption: { size: 12, lineHeight: 16, weight: '500' as const, tracking: 0.2 },
  overline: { size: 11, lineHeight: 14, weight: '700' as const, tracking: 1.2 },
  score: {
    size: 28,
    lineHeight: 32,
    weight: '700' as const,
    tracking: -0.4,
    variant: 'tabular-nums' as const,
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
