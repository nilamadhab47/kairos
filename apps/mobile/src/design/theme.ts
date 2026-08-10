/**
 * Adaptive theme — resolves palette tokens into semantic roles that primitives
 * consume. One design language; the theme just swaps values for scheme.
 */
import { palette, type SportKey } from './tokens';

export type ThemeScheme = 'dark' | 'light';

export type Theme = {
  scheme: ThemeScheme;
  color: {
    bg: string;
    bgElevated: string;
    bgSunken: string;
    surface: string;
    surfacePressed: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textFaint: string;
    accent: string;
    accentDim: string;
    onAccent: string;
    live: string;
    danger: string;
    warn: string;
    success: string;
    scrim: string;
  };
  sport: Record<SportKey, string>;
};

const dark: Theme = {
  scheme: 'dark',
  color: {
    bg: palette.ink[800],
    bgElevated: palette.ink[600],
    bgSunken: palette.ink[900],
    surface: palette.ink[600],
    surfacePressed: palette.ink[500],
    border: palette.ink[300],
    borderStrong: palette.ink[200],
    text: palette.paper[900],
    textMuted: palette.paper[400],
    textFaint: palette.paper[300],
    accent: palette.brand[300],
    accentDim: palette.brand[500],
    onAccent: palette.ink[900],
    live: palette.live,
    danger: palette.danger,
    warn: palette.warn,
    success: palette.success,
    scrim: 'rgba(0,0,0,0.55)',
  },
  sport: palette.sport,
};

const light: Theme = {
  scheme: 'light',
  color: {
    bg: palette.paper[900],
    bgElevated: '#FFFFFF',
    bgSunken: palette.paper[800],
    surface: '#FFFFFF',
    surfacePressed: palette.paper[800],
    border: palette.paper[700],
    borderStrong: palette.paper[600],
    text: palette.ink[900],
    textMuted: palette.paper[300],
    textFaint: palette.paper[400],
    accent: palette.brand[500],
    accentDim: palette.brand[400],
    onAccent: '#FFFFFF',
    live: '#0FA671',
    danger: '#DC4B4B',
    warn: '#C48221',
    success: '#0FA671',
    scrim: 'rgba(0,0,0,0.35)',
  },
  sport: palette.sport,
};

export const themes = { dark, light } as const;

/**
 * KAIROS launches in dark by default — that is the brand identity.
 * Light theme values remain available via `themes.light` for future opt-in,
 * but the system color scheme does not switch appearance automatically.
 */
export function useTheme(): Theme {
  return dark;
}
