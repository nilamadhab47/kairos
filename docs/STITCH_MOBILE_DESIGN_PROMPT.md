# Google Stitch Prompt — Kairo Mobile App (Complete MVP Design)

> **How to use:** Paste this entire document into Google Stitch as the master design brief.
> Ask Stitch to produce a **complete mobile UI kit + every MVP screen** in light and dark mode, with motion notes on each screen.
> Do **not** design a marketing website. Do **not** design a desktop app. **iOS + Android phone** only (390×844 baseline, also show 360×780 compact).
>
> **Existing inspiration (do not pixel-copy):** Figma file `T2bShVOxE0toFyG5xSN1ky` — splash, welcome, sports grid, Today+Brief+timeline, event bottom sheets. Read `docs/FIGMA_DESIGN_REVIEW.md` keep/drop list. Evolve gaps: email auth, empty/loading/error, light mode, Calendar/Alerts/Settings, notification permission. **MVP sports = Football, F1, Cricket, Tennis only** (no Basketball/MMA/NBA as primary). **No hamburger.** **No Add to Calendar in MVP.**

---

## 0. Role & output contract for Stitch

You are a principal product designer creating an **App Store–featured** consumer mobile app.

**Deliver:**

1. Design system (tokens, type, color, radius, elevation, icons, motion)
2. Full component library
3. Complete screen set for MVP (listed below)
4. User-flow boards (happy path + failure + edge cases)
5. Light mode + dark mode for every screen
6. Annotation layer: purpose, primary CTA, gestures, a11y, motion

**Do not deliver:** generic Bootstrap/Material template look, purple SaaS gradients, cluttered dashboards, dense “admin” UI, emoji-as-UI, or dark-pattern engagement tricks.

**Quality bar:** Linear × Headspace × Duolingo energy × Apple HIG clarity. Premium, playful, memorable — never gimmicky.

---

## 1. Product context

### 1.1 Overview

**Kairo** (“the right moment, not just the right time”) is a smart event aggregator. It pulls sports schedules (starting with Formula 1, then football), and later calendar/habits, into one calm timeline. It sends **a few high-signal notifications** (push first) with contextual copy — not 50 noisy reminders.

**Platform:** Expo React Native app for **iOS and Android** (primary product). Web is marketing-only — ignore web chrome.

**MVP north star flow:** Sign in → pick sports → see today’s events → receive a pre-event push 15 minutes before.

### 1.2 Target audience

- Ages ~18–40
- Sports fans (F1, football) who also juggle work calendars
- People drowning in notification noise who want **3–4 that matter**
- Mobile-native; expect App Store polish
- Global; default examples can use IST / UTC+5:30 but UI must be timezone-aware

### 1.3 Core user goals

1. Know what’s happening **today** in one glance
2. Get notified at the **right moment** (not too early, not spammy)
3. Set up in **under 60 seconds**
4. Feel in control of channels, DND, and subscriptions
5. Trust the app enough to grant notification permission

### 1.4 Brand personality

| Trait | Expression |
|---|---|
| Calm confidence | Generous whitespace, quiet chrome, clear hierarchy |
| Chronograph precision | Time as a first-class visual; “NOW” awareness |
| Playful spark | Soft bounce, celebration on onboarding complete — never childish |
| Editorial clarity | Short copy, sport-native language (“Lights out in 15”) |
| Human, not corporate | Friendly empty states; no enterprise jargon |

**Voice examples**

- Good: “Lights out in 15.”
- Good: “Race weekend. You’re covered.”
- Bad: “You have 1 pending notification reminder scheduled.”

### 1.5 Design principles

1. **One job per screen** — no dashboard soup
2. **Brand first** — “Kairo” is a hero signal on splash/welcome, not a tiny nav label
3. **Moment over menu** — timeline and brief outrank settings chrome
4. **Signal, not noise** — category color dots > badge spam
5. **Motion with meaning** — every animation explains state change
6. **Thumb-first** — primary CTAs in easy reach; destructive actions harder to hit
7. **Honest empty states** — never fake data
8. **Accessible by default** — Dynamic Type, contrast, reduce motion

### 1.6 Accessibility requirements

- WCAG AA contrast minimum (AAA for body text where feasible)
- Hit targets ≥ 44×44 pt
- Support Dynamic Type / large text without truncation disasters
- VoiceOver / TalkBack labels on all icon-only controls
- Visible focus states where applicable
- `prefers-reduced-motion`: replace parallax/confetti with opacity/crossfade
- Color is never the only status signal (pair with icon/text)
- Error text adjacent to fields, not only toasts

### 1.7 Mobile-first philosophy

- Design for one hand, portrait
- Safe areas respected (notch, home indicator, Android system bars)
- Bottom tab bar: 4 items max for MVP
- Prefer bottom sheets over full-screen modals for secondary tasks
- Offline/poor-network states designed, not afterthoughts

---

## 2. Design system

### 2.1 Creative direction (avoid generic AI UI)

**Do not use:**

- Purple-to-indigo SaaS gradients on white
- Warm cream (#F4F1EA-ish) + terracotta serif “lifestyle” kit
- Dense newspaper / broadsheet hairlines
- Neon cyberpunk glow stacks
- Rounded-full pill overload
- Multi-layer drop shadows everywhere

**Do use:**

- A distinctive **“signal” accent** inspired by a chronograph hand / starting lights
- Cool, crisp neutrals (ink + mist) — premium like Linear/Stripe
- One warm accent for delight (celebration, live)
- Category chroma as a controlled system (football / F1 / calendar / habit)

### 2.2 Color palette — propose exact hex and semantic tokens

Define **Light** and **Dark** themes with these semantic roles:

| Token | Role |
|---|---|
| `bg.app` | App background |
| `bg.elevated` | Cards, sheets |
| `bg.sunken` | Inputs, wells |
| `bg.inverse` | Inverse surfaces |
| `text.primary` | Main copy |
| `text.secondary` | Supporting |
| `text.tertiary` | Meta / timestamps |
| `text.inverse` | On accent / inverse |
| `border.subtle` | Hairlines |
| `border.strong` | Emphasized |
| `accent.primary` | Brand signal (CTAs, focus) |
| `accent.secondary` | Subtle brand tint backgrounds |
| `accent.gradient` | **Sparse** — splash, celebration only |
| `state.success` | Success |
| `state.warning` | Warning |
| `state.danger` | Errors / destructive |
| `state.info` | Informational |
| `category.f1` | F1 accent |
| `category.football` | Football accent |
| `category.cricket` | Cricket (future, define now) |
| `category.tennis` | Tennis (future) |
| `category.calendar` | Work/calendar |
| `category.habit` | Habits |
| `category.live` | Live now pulse |
| `overlay.scrim` | Modal scrim |

**Brand accent direction:** Choose a vivid but refined signal color (e.g. chronograph amber-orange OR electric teal-mint — pick one coherent system). Pair with near-black ink and cool gray mist. Dark mode is first-class, not an invert filter.

**Glass:** Optional frosted tab bar / sheet headers at ≤12% blur; never full-screen glassmorphism soup.

### 2.3 Typography

- **Display:** Distinctive modern grotesque or soft geometric (NOT Inter/Roboto/Arial as the hero). Think premium app display — comparable spirit to Linear’s clarity or Apple’s SF Pro Display, but specify an open/licensed family Stitch can use (e.g. **Satoshi / Geist / Plus Jakarta Sans / DM Sans** for UI; optional display face for splash wordmark only).
- **Body / UI:** Same family, readable weights
- Scale (mobile):

| Style | Size / weight | Use |
|---|---|---|
| Display XL | ~40–48 / semibold | Splash wordmark, rare |
| Display L | ~32 / semibold | Onboarding titles |
| Title | ~22–24 / semibold | Screen titles |
| Headline | ~18–20 / medium | Section headers |
| Body | ~16 / regular | Primary reading |
| Callout | ~15 / medium | Emphasized body |
| Subhead | ~14 / medium | Card titles |
| Footnote | ~13 / regular | Meta |
| Caption | ~11–12 / medium | Timestamps, badges |

Tabular nums for times. Never truncate event titles mid-word without ellipsis rules.

### 2.4 Spacing scale

4-pt base: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.  
Screen horizontal padding: **20**.  
Card internal padding: **16**.  
Section gaps: **24–32**.

### 2.5 Border radius

| Token | Value | Use |
|---|---|---|
| `radius.sm` | 8 | Chips, inputs compact |
| `radius.md` | 12 | Buttons, inputs |
| `radius.lg` | 16 | Cards |
| `radius.xl` | 24 | Sheets, hero cards |
| `radius.full` | 999 | Avatars, dots only |

Avoid squircle overload; cards `lg`, sheets `xl`.

### 2.6 Elevation / shadows

Soft, single-layer shadows only:

- `elevation.1` — resting cards (light mode); dark mode use border not heavy shadow
- `elevation.2` — floating buttons / snackbars
- `elevation.3` — modals / sheets

No 3-stack shadows. Prefer border + background shift in dark mode.

### 2.7 Iconography

- Consistent set: **SF Symbol–like** optical size, 1.5–2px stroke, rounded caps
- Sizes: 16 / 20 / 24
- Tab icons: outline default, filled when selected (subtle, not loud)
- Category glyphs: helmet/flag (F1), ball (football), calendar, spark (habit)
- Never use emoji as structural icons

### 2.8 Illustrations

- Custom, minimal, geometric-editorial (Headspace calm + Arc playfulness)
- Empty states: single focal illustration + 1 sentence + optional CTA
- Onboarding: 1 illustration per step max; brand wordmark dominates welcome
- No 3D plastic claymorphism overload

### 2.9 Component styling rules

- **Primary button:** solid accent, 52pt height, medium label, press scale 0.97 + haptic light
- **Secondary:** outline / soft fill
- **Tertiary / ghost:** text button
- **Destructive:** danger text or outline; confirm in sheet
- **Inputs:** sunken fill, 52pt, clear error under field
- **Cards:** elevated bg, no border in light if shadow; hairline border in dark
- **Lists:** timeline style with time column + content; not generic Material list spam
- **Chips:** selectable sports interests — scale + accent border when selected
- **Badges:** live = pulsing dot + “LIVE”; count badges rare

### 2.10 Dark mode & light mode

- Design **both** for every screen
- Dark: true deep ink (not pure `#000` only — slight blue-black), elevated surfaces step up
- Light: cool off-white / mist (not yellow cream)
- Accent luminance adjusted per theme for AA contrast on buttons
- Status bar / nav bar styles specified per theme

### 2.11 Motion & animation tokens

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion.instant` | 100ms | standard | Press feedback |
| `motion.fast` | 180ms | standard | Toggles, chips |
| `motion.base` | 280ms | emphasized | Screen pushes |
| `motion.slow` | 420ms | emphasized | Sheets, onboarding |
| `motion.splash` | 900–1200ms | custom | Brand reveal |
| `spring.snappy` | — | spring | Buttons, chips |
| `spring.soft` | — | spring | Sheets |

Reduce-motion fallbacks mandatory.

### 2.12 Design tokens export

Provide a token table Stitch/developers can map to NativeWind CSS variables:

```
--color-bg-app
--color-accent-primary
--space-4
--radius-lg
--font-display
...
```

### 2.13 Responsive behavior

- Baseline: **390×844** (iPhone 14/15 class)
- Also compose **360×780** Android compact
- Large text: stack timeline meta above title if needed
- Landscape: not required for MVP (portrait lock OK to note)

---

## 3. Navigation architecture

### 3.1 App structure (Expo Router mental model)

```
Splash (brand)
  → Session resolve
      → (auth) Welcome / Sign in / Sign up / Forgot / Verify
      → (onboarding) Sports → (optional) Notifications permission → Done
      → (tabs)
            Today (Home)
            Calendar (Week — can be lightweight MVP)
            Alerts (Notification history)
            Settings (Profile entry)
```

**Floating:** Event detail sheet, notification permission sheet, account deletion confirm, filters sheet.

### 3.2 Tab bar (main navigation)

4 tabs:

1. **Today** — primary home
2. **Calendar** — week strip + list (MVP can be simple)
3. **Alerts** — notification history / brief archive
4. **Settings** — preferences, profile, account

Selected tab: filled icon + accent tint label. Unselected: muted.

### 3.3 Screens inventory (production-ready MVP)

#### System / session

1. Splash / brand
2. Session restoring (skeleton shell)
3. Force update / maintenance (optional simple)
4. No network / API unreachable
5. Generic error boundary

#### Authentication

6. Welcome (brand hero + CTAs)
7. Sign in (email)
8. Sign up (email)
9. Forgot password
10. Check email / reset sent
11. Email verification pending
12. Email verified success
13. Auth error (account exists, invalid credentials, OAuth cancel)
14. Apple Sign-In system sheet context (in-app framing)
15. Google Sign-In browser return interstitial (brief)

#### Onboarding

16. Sports interest picker
17. (Optional MVP) Teams/series tease — or skip with “You’ll customize later”
18. Notification permission explain + system prompt bridge
19. Onboarding success / “You’re ready”

#### Home / Today

20. Today — populated
21. Today — empty (no subscriptions events)
22. Today — loading skeletons
23. Today — error + retry
24. Morning brief card (preview state)
25. Event detail (sheet or screen)
26. Pull-to-refresh state

#### Calendar

27. Week view — populated
28. Week view — empty
29. Week view — loading

#### Alerts

30. Alerts list — populated
31. Alerts — empty
32. Alerts — loading
33. Alert detail / brief expanded

#### Profile / Settings

34. Settings hub
35. Profile / edit name + avatar
36. Timezone display
37. Notification preferences (channels, DND, max daily, pre-event mins)
38. Subscriptions manage (sports)
39. Connected devices / push status
40. Legal (Privacy / Terms placeholders)
41. Sign out confirm
42. Delete account warn → confirm type email
43. Delete account success

#### Notifications (system adjacent)

44. In-app toast/snackbar styles (success/error/info)
45. Push permission denied education screen

---

## 4. User flows (design each end-to-end)

For every flow, design **success**, **failure**, and **edge** frames.

### 4.1 First-time user experience

Splash → Welcome → Auth (choose method) → (verify if email) → Sports onboarding → Notification permission → Today empty/populated → optional first push education.

**Delight:** Soft confetti or signal-pulse on onboarding complete (reduce-motion: checkmark morph).

### 4.2 Registration (email)

Welcome → Sign up → validation inline → submit loading → verification pending → deep link verified → onboarding.

**Failures:** email taken, weak password, network error, too many attempts.

### 4.3 Login (email)

Welcome → Sign in → success → tabs or onboarding if incomplete.

**Failures:** wrong password, unverified email gate, locked/rate limited.

### 4.4 Google Sign-In

Welcome → Continue with Google → system/browser → return → session → route by onboarding flag.

**Edge:** user cancels; account merge if email exists; offline.

### 4.5 Apple Sign-In (iOS)

Same as Google; hide Apple button on Android. Honor Hide My Email (show relay email in profile).

### 4.6 Forgot password

Sign in → Forgot → enter email → Check email → open link → set new password → Sign in.

### 4.7 Email verification

Pending screen with resend (cooldown timer), change email, logout.

### 4.8 Session management

Cold start splash → restore session spinner overlay on brand → route. Expired session → Welcome with friendly “Sign in again”.

### 4.9 Profile

Settings → Profile → edit name → save toast → avatar initials fallback.

### 4.10 Settings

Hub list with grouped sections: Account, Notifications, Subscriptions, Support, Danger zone.

### 4.11 Logout

Settings → Sign out → confirm sheet → Welcome.

### 4.12 Account deletion

Danger zone → explain data loss → type email confirm → deleting progress → Welcome + success toast.

---

## 5. Component library (specify variants)

Design each with default / pressed / disabled / loading / error where relevant; light + dark.

1. **Buttons** — primary, secondary, tertiary, destructive, icon-only, social (Google/Apple)
2. **Inputs** — text, email, password (show/hide), search
3. **Form field** — label, helper, error
4. **Cards** — EventCard, BriefCard, SettingRow, InterestChipCard
5. **Lists** — timeline list, grouped settings, alerts list
6. **Bottom sheets** — snappy spring, grabber, detents
7. **Modals** — rare; prefer sheets
8. **Toasts** — top or bottom safe; auto-dismiss
9. **Nav bars** — large title Today; inline secondary screens
10. **Tab bar** — 4 tabs + optional subtle blur
11. **Search** — calendar/alerts filter (MVP light)
12. **Filters** — sport chips row
13. **Empty states** — illustration + copy + CTA
14. **Skeletons** — shimmer EventCard, BriefCard, list rows
15. **Progress** — linear determinate (onboarding steps), circular indeterminate
16. **Avatars** — image / initials
17. **Badges** — LIVE, count, category
18. **Chips** — selectable / filter / static
19. **Tabs** — segmented (Day/Week if needed)
20. **Switch / checkbox** — notification prefs
21. **NOW indicator** — timeline rail marker
22. **Category dots** — 8pt
23. **Social auth buttons** — official visual guidelines compliant
24. **Stepper** — onboarding 1 of N

Ensure visual consistency: same radii, type roles, accent usage.

---

## 6. Screen specifications (detail every MVP screen)

For each screen below, Stitch must specify: purpose, layout hierarchy (top→bottom), primary/secondary actions, interactions/gestures, animation, validation, a11y, light/dark.

### Splash

- Full-bleed brand field (subtle motion gradient or soft mesh — not purple SaaS)
- Wordmark **Kairo** hero-scale centered
- Tagline fade-in: “The right moment, not just the right time.”
- 900–1200ms then crossfade to next
- Haptic: soft impact on logo settle (optional)

### Welcome

- Brand hero (top 40–50% visual plane — full-bleed atmosphere, not inset card collage)
- Headline secondary to brand
- One supporting sentence
- CTA stack: Continue with Apple (iOS) · Continue with Google · Continue with email
- Footer: Terms / Privacy text links
- No stats, no feature grids on first viewport

### Sign in / Sign up

- Clean form, social alternate at top or bottom (pick one pattern and stick)
- Inline validation
- Keyboard-aware layout
- Primary CTA sticky above keyboard when focused

### Forgot / Verify

- Calm, single-purpose; large illustration optional; resend cooldown

### Sports onboarding

- Title: “What should Kairo watch?”
- Large selectable interest cards/chips (Football, F1, Cricket, Tennis)
- Multi-select; progress 1/2
- Primary: Continue (disabled until ≥1)
- Secondary: skip only if product allows — prefer requiring one sport
- Selection: spring scale + accent border + light haptic

### Notification permission

- Benefit-led copy (“3–4 alerts that matter — not dozens”)
- Preview fake notification card UI (Kairo style)
- Allow / Not now
- If denied later: Settings deep-link education

### Onboarding success

- Short celebration
- CTA: Go to Today

### Today (home)

**Hierarchy:**

1. Large title “Today” + date
2. Morning brief card (if data)
3. Timeline with optional NOW rail
4. Event cards (time | category dot | title | subtitle | live badge)

**Actions:** pull-to-refresh; tap card → detail sheet; long-press optional mute/star later  
**Empty:** friendly art + “Pick sports in Settings” CTA  
**Loading:** skeletons matching card layout  
**Error:** inline retry

### Event detail

- Sheet: title, time range, category, subtitle, “Notify 15 min before” status, dismiss

### Calendar

- Week strip + list of events; empty/loading variants

### Alerts

- Chronological notification history; unread subtle marker; empty: “No alerts yet — quiet is good.”

### Settings hub

- Profile header (avatar, name, email)
- Groups: Notifications, Subscriptions, Account, About
- Danger zone separated

### Notification preferences

- Toggles: push (WhatsApp later = disabled/coming soon)
- Brief time, DND start/end, max daily push, pre-event minutes
- Clear save feedback

### Account deletion

- Multi-step irreversible; type email; no dark patterns delaying cancel

---

## 7. Visual style synthesis

Combine:

- **Linear** — density discipline, crisp type, quiet chrome  
- **Notion** — calm surfaces, friendly empties  
- **Stripe** — trust, precision, restrained accent  
- **Duolingo** — reward moments, springy micro-interactions (dialed to 40%, not cartoon)  
- **Headspace** — breathing room, soothing empty states  
- **Arc** — tasteful personality, memorable silhouette  
- **Airbnb** — large imagery/hero on welcome only  
- **Apple HIG** — navigation patterns, haptics, clarity  
- **Material 3** — motion easing reference, not literal M3 components  
- **Raycast** — command-like speed, focus on primary action  

**Resulting feel:** modern, premium, slightly funky, fast, delightful, cohesive — like an App Store Features candidate, not a CRUD starter kit.

---

## 8. Motion design (core product layer)

Specify storyboard notes for:

1. Splash logo draw / fade + tagline  
2. Onboarding shared-element interest chip → selected  
3. Auth: social button press → brief branded interstitial → return  
4. Tab switches: crossfade content 180–220ms  
5. Today: NOW rail subtle pulse (live)  
6. EventCard press: scale 0.98 + opacity  
7. Bottom sheet spring + dim scrim  
8. Skeleton shimmer (respect reduce motion → static pulse opacity)  
9. Pull-to-refresh custom spinner using brand accent arc  
10. Empty state illustration idle loop (very subtle)  
11. Success check morph; error shake (subtle, 2 cycles max)  
12. Onboarding complete celebration (confetti **or** signal burst — one only)  
13. Haptics map: light (select), medium (success), warning (destructive confirm)  
14. Gesture: swipe down dismiss sheets; edge swipe back  
15. Scroll: collapse large title Today  

**Rule:** If removing the animation doesn’t hurt understanding, simplify it.

---

## 9. Engagement (ethical)

- Memorable splash + welcome  
- Clear hierarchy always  
- Reward onboarding completion once  
- Fast perceived performance (skeletons, optimistic chip select)  
- Personalized greeting using first name once known (“Morning, Maya”) — optional, not creepy  
- Progress on onboarding stepper  
- Friendly empties (“Quiet day. Rare.”)  
- No infinite badges, no fake urgency, no confirmshaming  

---

## 10. Premium UI component flourishes (use sparingly)

- Gradient accents **only** on splash/celebration  
- Light glass on tab bar  
- Soft shadows on light cards  
- Rounded `radius.lg` cards  
- Dynamic category accents on timeline  
- Elegant icons + 3–5 custom illustrations  
- Refined type + strict spacing rhythm  
- Adaptive dark mode  

**Do not** put floating promo stickers on the hero. **Do not** card-ify the welcome hero.

---

## 11. Copy deck (seed for Stitch)

| Location | Copy |
|---|---|
| Tagline | The right moment, not just the right time. |
| Welcome support | A calm timeline for race weekends, match days, and what matters today. |
| Sports title | What should Kairo watch? |
| Sports subtitle | Pick a few. You can change this anytime. |
| Notif title | Only the alerts that matter |
| Notif body | Aim for 3–4 a day. Morning brief + pre-event pings. |
| Today empty | Nothing on your radar yet. |
| Alerts empty | No alerts yet — quiet is good. |
| Pre-event example | Lights out in 15. |
| Sign out | Sign out of Kairo? |
| Delete | This permanently deletes your account and data. |

---

## 12. Deliverable checklist for Stitch

- [ ] Token sheet (light/dark)
- [ ] Type specimen
- [ ] Component gallery
- [ ] All screens in §3.3 (light + dark)
- [ ] Flow boards §4
- [ ] Motion annotations per key screen
- [ ] iOS and Android status/nav treatment notes
- [ ] Redlines / spacing enough for Expo + NativeWind implementation
- [ ] Exportable style guide summary page titled **Kairo Design System**

---

## 13. Explicit anti-goals

- No hamburger-first navigation  
- No statistics strips on welcome  
- No WhatsApp setup in MVP UI (can show “Coming soon” disabled row)  
- No habit tracker screens in MVP (optional future footnote only)  
- No desktop sidebar  
- No purple generic AI aesthetic  

---

**Final instruction to Stitch:**  
Design Kairo so that if the tab bar were hidden, a user would still know this is Kairo — brand, typography, timeline metaphor, and “moment” accent must be unmistakable. Every screen intentional; every motion purposeful; every interaction enjoyable.
