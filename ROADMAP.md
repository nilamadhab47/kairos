# Kairo — Roadmap (source of truth)

> Milestones below replace ad-hoc “sprint: 0 / sprint: 1” labels as the planning spine.
> Map GitHub issues to these milestones. Product loop before polish.

Last updated: 2026-08-07

---

## Design inputs

- Figma inspiration audit: [`docs/FIGMA_DESIGN_REVIEW.md`](./docs/FIGMA_DESIGN_REVIEW.md)
- Stitch master prompt: [`docs/STITCH_MOBILE_DESIGN_PROMPT.md`](./docs/STITCH_MOBILE_DESIGN_PROMPT.md)

**MVP UI scope locked after Figma review:** Splash → Welcome → Auth → 4 sports (Football, F1, Cricket, Tennis) → Notification permission → Today (Brief + timeline + EventDetailSheet + Notify). No hamburger. No Basketball/MMA/NBA in M1–M2. No Add-to-Calendar until M4.

---

## Milestone M0 — Align & reset foundation

**Goal:** One truth, honest local loop, clean Expo shell, auth provider wired (no product features yet).

| Work | Outcome |
|---|---|
| Docs | `ARCHITECTURE.md` + this file authoritative; tech spec §2 superseded |
| Repo hygiene | Commit `pnpm-lock.yaml`, Prisma `init` migration, gate `/test` routes |
| Security | Fix auth middleware fallthrough; CORS allowlist for non-dev |
| Mobile soft reset | Clean Expo Router shell in `apps/mobile`; keep monorepo |
| Auth | Better Auth on Fastify + Expo client (Google + Apple + email/password) |
| Issues | Close Clerk #5; rewrite Clerk-dependent issues; create milestones | **Done** — milestones M0–M4; #5 closed; #20–#25 added |

**Exit:** Cold start → sign up / Google / Apple (simulator or device) → session persists → `/api/auth` session works → user row exists.

---

## Milestone M1 — Onboarding & identity complete

**Goal:** First-run experience finished; timezone + sports subscriptions persisted.

| Order | Work | Notes |
|---|---|---|
| 1 | Auth screens | Welcome, email sign-up/sign-in, Google, Apple (iOS) |
| 2 | Session routing | Expo Router groups: `(auth)` vs `(onboarding)` vs `(tabs)` |
| 3 | Timezone capture | Device TZ → profile on first session |
| 4 | Onboarding step 1 | Pick **Football, F1, Cricket, Tennis** → `user_subscriptions` |
| 5 | Notification permission | Benefit-led explain → system prompt (#28) |
| 6 | Done | `onboarding_done = true`; land on Today |

**Exit:** New user completes onboarding in &lt; 60s; returning user skips to Today.

---

## Milestone M2 — Vertical product loop

**Goal:** F1 ingest → Today timeline → Expo push 15 min before.

| Order | Work |
|---|---|
| 1 | OpenF1 ingest job (24h) + event upsert |
| 2 | `GET /api/events/today` |
| 3 | Today UI (`EventCard` + optional Brief stub) |
| 4 | `EventDetailSheet` + Notify CTA (#27) |
| 5 | `user_devices` + push token registration |
| 6 | Pre-event BullMQ job + Expo Push (templated copy) + DND skip |

**Exit:** Real device receives a push for a subscribed F1 session.

---

## Milestone M3 — Depth (after the loop)

- Football fixtures (copy F1 pattern)
- In-app morning brief card (local/templated)
- Notification prefs UI
- Alerts history
- Light polish (NOW rail, haptics) — formerly issues #17–#19
- In-app error log (Postgres, capped + deduped) — not Sentry

## Google Calendar (build next — in-app calendar, not just store listing)

**Goal:** The in-app Calendar tab should feel like Google Calendar for *your* sports: month/week, kickoff as timed events, add-to-device-calendar, later sync to a real Google Calendar.

User.googleToken and ConnectedSource already exist in Prisma for this. Do not scrape calendars.

| Order | Work |
|---|---|
| 1 | Device calendar (Expo Calendar) — one event per followed fixture, timezone-aware, user opt-in in Settings |
| 2 | ICS export of `/api/me/week` for people who subscribe from Google/Apple Calendar |
| 3 | Google Calendar OAuth (`ConnectedSource.sourceType = google_calendar`, encrypt tokens in `User.googleToken`) — create/update/delete the same fixtures on a dedicated "Kairos" calendar |
| 4 | Two-way: show the user's own Google events on the Kairos calendar only if they opt in (busy/free, no email contents) |

Keep WhatsApp / Claude copy / Telegram in this milestone still deferred.

## Milestone M4 — Channels & intelligence (defer)

- WhatsApp / Twilio
- Claude AI copy + cache
- Habits, YouTube, Telegram

---

## Explicitly cut from early issues / old MVP list

| Item | Disposition |
|---|---|
| Clerk migration (#5) | **Close — wontfix** |
| PWA primary client | Retired |
| WhatsApp in first vertical slice | M4 |
| AI copy in first slice | M4 |
| Calendar in first slice | M4 |
| NOW / haptics / brief card in Sprint 1 | Move to M3 |
| Deploy issues #7–#9 closed without artifacts | Re-verify or re-open |

---

## Suggested GitHub milestone names

1. `M0 — Align & auth foundation`
2. `M1 — Onboarding`
3. `M2 — F1 → Today → Push`
4. `M3 — Depth`
5. `M4 — Channels & AI`
