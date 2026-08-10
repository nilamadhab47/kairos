# Kairo — Mobile design system

Living reference for tokens, motion, and primitives. Everything in `apps/mobile/src/design/*`
and `apps/mobile/src/components/*` must resolve to these tokens — no ad-hoc hex, sizes, or timings.

## Principles

1. **Fast first, beautiful second.** No animation may block interaction.
2. **Subtle motion.** Springs and short timings; users should feel it, not watch it.
3. **One design language.** Dark and light are the same system, different values.
4. **Personalization slot, not chaos.** Team/sport accents are additive; base palette stays calm.
5. **Reduce-motion always.** Every animated primitive collapses to instant when the OS asks.

## Tokens

### Color roles (`useTheme().color`)
| Role | Purpose |
|---|---|
| `bg` / `bgElevated` / `bgSunken` | Screen, cards, deeper surfaces |
| `surface` / `surfacePressed` | Card surface, pressed state |
| `border` / `borderStrong` | Dividers, card outlines, focus rings |
| `text` / `textMuted` / `textFaint` | Hierarchy: primary, meta, disabled |
| `accent` / `accentDim` / `onAccent` | Brand teal + label on top of it |
| `live` / `success` / `warn` / `danger` | Semantic status |
| `scrim` | Modal / sheet backdrop |

`useTheme().sport` maps football / f1 / cricket / tennis / basketball / hockey / baseball to a
subtle accent hex — used for chip highlights, crest rings, category dots.

### Typography (`typography.*`)
`display` (34) → `title` (22) → `subtitle` (17) → `body` (15) → `caption` (12) → `overline` (11)
Plus `score` (28, tabular nums) for match scores.

### Spacing (4pt)
`0, 1(4), 2(8), 3(12), 4(16), 5(20), 6(24), 8(32), 10(40), 12(48), 16(64)`

### Radii
`xs 6 · sm 8 · btn 12 · card 16 · sheet 24 · pill 999`

### Motion
- Durations `instant 90 · fast 140 · base 200 · slow 280 · lazy 400`
- Springs `press` (button squish), `soft` (enter/leave), `sheet` (bottom sheet)
- Prefer springs for interactive feedback; timings for state changes

Use `useMotionSafeSpring(preset)` / `useMotionSafeTiming(duration)` so reduce-motion is honored.

### Haptics
`haptics.light | medium | select | success | warning | error` — no-op on web, silent errors.

## Primitives

| Component | Motion / haptics |
|---|---|
| `Button` | Press spring + configurable haptic |
| `Chip` | Press spring + selection tint (soft timing) + selection haptic |
| `Card` | Press micro-scale (only when interactive) |
| `TeamCrest` | Image fade-in (140ms), initials fallback, team-color ring slot |
| `StatusPill` | LIVE dot pulse (900ms loop), calm otherwise |
| `Skeleton` / `SkeletonCard` | Opacity shimmer (1.1s loop), disabled under reduce-motion |
| `EmptyState` / `ErrorState` | Static — action button carries the motion |
| `SectionHeader` | Static |
| `Screen` | Safe-area wrapper (background from theme) |

## Non-goals

- No third design language for tablet — same tokens, wider layouts
- No animation on every scroll frame
- No neon/gaming palettes; sport accents are muted
- No confetti / big celebration effects on scoring
