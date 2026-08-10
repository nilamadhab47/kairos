# Figma Design Review — Inspiration Audit

**File:** [Untitled (Kairo screens)](https://www.figma.com/design/T2bShVOxE0toFyG5xSN1ky/Untitled?t=Ia7UB7fpkGo05gZJ-0)  
**Reviewed:** 2026-08-07  
**Stance:** Inspiration only — evolve into a production design system; do **not** pixel-match.

---

## 1. What’s in the file

| Frame | Node | Role |
|---|---|---|
| Splash Screen | `1:249` | Brand reveal |
| Welcome Screen | `1:116` | Auth entry |
| Onboarding: Sports Selection | `1:257` | Interest picker |
| Today Timeline | `1:146` | Home |
| Event Detail: F1 Qualifying | `1:2` | Detail sheet (rich) |
| Event Detail: Football Match | `1:79` | Detail sheet (compact) |

**Not in file:** email sign-in/up, forgot/verify, notification permission, Calendar/Alerts/Settings bodies, empty/loading/error, light mode, account/profile/delete, design-system page, motion specs.  
**Variables:** none exported (`get_variable_defs` empty) — colors are hardcoded.

---

## 2. Strongest elements (keep)

1. **Dark-first + teal/cyan signal accent** — chronograph “moment” color; premium Linear/Stripe energy without purple SaaS cliché.
2. **Logo mark** — stopwatch/compass glyph + KAIRO wordmark; brand-first splash/welcome.
3. **Welcome composition** — hero brand field + bottom CTA stack (Apple / Google / Email) + Terms·Privacy; matches ARCHITECTURE + Stitch principles.
4. **Today metaphor** — Morning Brief card → vertical rail + **NOW** marker → category-accented EventCards; this *is* the product.
5. **Event detail as bottom sheet** — task-focused overlay; primary CTA **Notify 15m before** makes the MVP loop visible in UI.
6. **Category language** — color dot + left accent bar + LIVE badge; scannable without clutter.
7. **F1 “Circuit Details” bento** — optional rich metadata pattern for sports that have it (keep as progressive disclosure, not required for football).
8. **4-tab IA** — Today · Calendar · Alerts · Settings (aligns with roadmap).
9. **Onboarding grid** — large thumb-friendly interest cards; copy matches Stitch deck (“What should Kairo watch?”).

---

## 3. Improve / modernize

| Issue | Recommendation |
|---|---|
| No token system in Figma | Codify tokens in `docs/DESIGN.md` + NativeWind from this palette; rebuild components in Stitch/Figma as variants |
| F1 vs Football sheets diverge | One `EventDetailSheet` with slots: header, meta rows, optional `SportExtras`, primary CTA, optional secondary |
| Apple solid black on near-black | Raise contrast (elevated surface or light fill per HIG); keep Google outline; Email as secondary solid soft-fill, not plain text only |
| Disabled Continue (onboarding) | Use clearer disabled style that still meets AA, or enable with validation toast if empty |
| Morning Brief card | Keep; ensure empty/loading variants; don’t require Claude for MVP |
| Atmospheric stadium photo (football) | Optional enhancement; don’t block MVP on photography pipeline |
| Tab selected cyan pill | Keep; document selected/unselected icon states |

---

## 4. UX / consistency issues

1. **Hamburger + Settings tab** on Today — redundant. Drop hamburger; avatar → Profile/Settings is enough.
2. **Duplicate “Today” title** — top app bar + large title. Prefer large title only (iOS pattern) or compact bar on scroll.
3. **Onboarding dismiss (X)** — conflicts with “≥1 sport required.” Remove X on first-run; allow Skip only from Settings edit later.
4. **Sports scope creep** — Figma includes Basketball + MMA; Today shows NBA. **MVP sports remain:** Football, F1, Cricket, Tennis. Extra cards = disabled “Coming soon” or omit until M3+.
5. **Add to Calendar** on football sheet — Calendar OAuth is **M4**. Hide or “Coming soon” for MVP.
6. **Inconsistent category labeling** — “FORMULA 1” vs “PREMIER LEAGUE” (competition) vs sport. Standardize: sport category + competition as subtitle.
7. **No light mode** — ship dark as default; design light tokens before App Store.
8. **Auth incomplete** — Welcome alone isn’t a flow; need email screens + errors.

---

## 5. Simplify flows

**Proposed FTUE (aligned with ROADMAP):**

```
Splash → Welcome → (Apple|Google|Email auth) → Sports (4 MVP) → Notification permission → Today
```

- Skip team picker in M1 (already deferred).
- Event open → sheet → Notify; no separate stack push required for MVP.
- Settings owns profile, subscriptions, DND — not a hamburger drawer.

---

## 6. Missing screens & edge cases (must design before / during M0–M2)

Auth: Sign in, Sign up, Forgot, Verify, OAuth cancel/error, session restore.  
Onboarding: Notification permission explain.  
Today: empty, loading skeletons, error+retry, brief absent.  
Tabs: Calendar / Alerts / Settings hubs (even if sparse).  
System: offline, permission denied education.  
Account: sign out confirm, delete account.  
Detail: notify success / already scheduled / DND skip messaging.

---

## 7. Accessibility

- Verify teal-on-black and gray-on-charcoal body text (AA).
- Timeline rail + NOW dot: don’t rely on color alone; keep “NOW” label.
- Hit targets on tab icons and interest cards: already large — keep ≥44pt.
- LIVE badge: pair color with text (already does).
- Reduce-motion: disable NOW pulse / brief glow.
- Dynamic Type: EventCard title ellipsis rules.

---

## 8. Navigation pattern (adopt)

| Pattern | Decision |
|---|---|
| Tabs | 4 tabs as designed |
| Detail | Modal bottom sheet (not full-screen push) |
| Auth | Stack `(auth)` |
| Onboarding | Stack `(onboarding)` once |
| Drawer/hamburger | **Do not implement** |
| Profile | Avatar → Settings/Profile |

---

## 9. Reusable components (extract)

`BrandMark`, `SocialAuthButton`, `PrimaryButton`, `SecondaryButton`, `InterestCard`, `MorningBriefCard`, `EventCard`, `NowRail`, `CategoryDot`, `LiveBadge`, `EventDetailSheet`, `MetaRow`, `SportExtrasBento`, `TabBar`, `EmptyState`, `SkeletonCard`.

---

## 10. Relationship to Stitch prompt & code

- **Figma** = visual north star for dark theme, teal accent, Today + sheets.
- **`docs/STITCH_MOBILE_DESIGN_PROMPT.md`** = fill gaps (auth, empty states, light mode, motion).
- **Code** = Expo soft-reset (#20); implement tokens + components against this review, not pixel Figma export.

---

## 11. Scope guardrails from this review

| Keep in MVP UI | Defer |
|---|---|
| Splash, Welcome, 4-sport onboarding, Today+Brief+rail+cards, Event sheet+Notify | Basketball/MMA/NBA |
| Teal dark system | Full light theme polish can trail slightly but tokens now |
| Push notify CTA | Add to Calendar, WhatsApp, AI copy |
| 4 tabs (Calendar/Alerts can be sparse) | Habit screens, drawer |
