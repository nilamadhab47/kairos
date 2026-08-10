# Kairo

> The right moment, not just the right time.

Smart event aggregator with AI-powered contextual notifications.

**Source of truth**

- Architecture & stack: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Milestones & sequencing: [`ROADMAP.md`](./ROADMAP.md)
- Third-party credentials: [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md)
- Design system + Figma audit: [`docs/DESIGN.md`](./docs/DESIGN.md) · [`docs/FIGMA_DESIGN_REVIEW.md`](./docs/FIGMA_DESIGN_REVIEW.md)
- Mobile UI design prompt (Google Stitch): [`docs/STITCH_MOBILE_DESIGN_PROMPT.md`](./docs/STITCH_MOBILE_DESIGN_PROMPT.md)
- Product / domain detail (partially historical): [`KAIRO_TECH_SPEC.md`](./KAIRO_TECH_SPEC.md)

This repo is a Turborepo monorepo. **Expo is the primary client**; Next.js exists only as the marketing site. Auth is **Better Auth** (Google + Apple + email/password) on the Fastify API — not Clerk, not NextAuth.

```
kairo/
├── apps/
│   ├── mobile/      Expo SDK 52 + Expo Router + NativeWind  (consumer app)
│   ├── server/      Fastify API + Better Auth + Scalar docs  (Railway)
│   └── web/         Next.js 15 landing page
└── packages/
    ├── db/          Prisma schema (PostgreSQL, 10 tables)
    ├── core/        Shared types + zod schemas
    └── queue/       BullMQ producer + worker
```

---

## Prerequisites

- Node 20.11+ (`nvm use` honors `.nvmrc`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker (for local Postgres + Redis)
- Expo CLI is installed via the workspace; run via `pnpm dev:mobile`
- A Google OAuth Client (web type) for ID-token verification on the server, plus
  iOS/Android client IDs for the mobile sign-in (see Google Cloud Console)

---

## First-time setup

```bash
# 1. Install workspace deps
pnpm install

# 2. Copy env template and fill it in
cp .env.example .env
# See ARCHITECTURE.md — Better Auth will own sessions.
# For local infra at minimum: DATABASE_URL, REDIS_URL, EXPO_PUBLIC_API_URL
# Auth secrets (Google/Apple OAuth client IDs, BETTER_AUTH_SECRET) when wiring M0.

# 3. Boot Postgres + Redis
pnpm docker:up

# 4. Generate Prisma client + run initial migration (creates all 10 tables)
pnpm db:generate
pnpm db:migrate          # interactive: name it "init"
```

Verify the schema landed:

```bash
pnpm db:studio           # opens Prisma Studio on http://localhost:5555
```

You should see Better Auth tables (`user`, `session`, `account`, `verification`) plus domain tables:
`user_subscriptions`, `events`, `user_events`, `notifications`, `notification_preferences`,
`habits`, `habit_completions`, `connected_sources`, `ai_copy_cache`, `user_devices`.

API docs (Scalar): with the server running open [http://localhost:4000/api/docs](http://localhost:4000/api/docs).
Third-party keys checklist: [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md).

---

## Daily dev

```bash
pnpm dev
```

That runs (in parallel via Turborepo):

- `@kairo/server` — Fastify on `http://localhost:4000`
- `@kairo/queue`  — BullMQ worker process
- `@kairo/mobile` — Expo dev server (scan the QR with Expo Go / dev client)
- `@kairo/web`    — Next.js landing on `http://localhost:3000`

Or run them individually:

```bash
pnpm dev:server
pnpm dev:worker
pnpm dev:mobile
pnpm dev:web
```

### Connecting the phone to your laptop API

`localhost` does not resolve from your phone. Set `EXPO_PUBLIC_API_URL` **and** `BETTER_AUTH_URL` to your
laptop's LAN IP (Mac: `ipconfig getifaddr en0`):

```env
EXPO_PUBLIC_API_URL=http://192.168.1.42:4000
BETTER_AUTH_URL=http://192.168.1.42:4000
BETTER_AUTH_SECRET=<at-least-32-char-secret>
```

Also put the same values in a root `.env` (copy from `.env.example`).

Restart `pnpm dev:mobile` / `pnpm dev:server` after changing them.

### Android testing (primary)

1. Start Docker Desktop, then `pnpm docker:up`
2. `pnpm db:generate && pnpm db:migrate:deploy` (or `pnpm db:migrate` once)
3. `pnpm dev:server` and `pnpm dev:worker`
4. USB/wireless debug → `pnpm --filter @kairo/mobile android` (local native build)
5. Or `pnpm dev:mobile` against an already-installed dev client

Email auth works without Google/Apple keys. Google/Apple need OAuth client credentials in `.env`.

---

## Verifying the scaffold

The four acceptance criteria from the kickoff:

### 1. `pnpm dev` starts server + Expo simultaneously
```bash
pnpm dev
# server: "[server] kairo-api listening on http://0.0.0.0:4000"
# worker: "[worker] kairo worker started — waiting for jobs"
# mobile: Expo dev server prints QR code
```

### 2. Mobile app boots and shows "Connected"
Open the Expo app on your phone. The boot screen pings `GET /health` and
either lands on the login screen ("Connected") or shows a "No connection"
fallback with the underlying error.

### 3. Google OAuth end-to-end
- Tap **Continue with Google** on `/login`
- expo-auth-session opens the system browser, returns a Google `id_token`
- Mobile POSTs `{ idToken }` to `/auth/google`
- Server verifies via `google-auth-library`, upserts a `users` row, signs a JWT
- JWT is stored in `expo-secure-store` and used for `Authorization: Bearer`
- App calls `/auth/me` and lands on the Today tab

### 4. Prisma migrations create all 10 tables
```bash
pnpm db:migrate
psql $DATABASE_URL -c "\dt"
# users, user_subscriptions, events, user_events, notifications,
# notification_preferences, habits, habit_completions,
# connected_sources, ai_copy_cache
```

### 5. Test BullMQ job round-trip
```bash
curl -X POST http://localhost:4000/test/enqueue \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello bull"}'
# → { "enqueued": true, "id": "1", "queue": "kairo:test" }
```

The worker terminal logs:
```
[worker:test] processing job 1 — message: "hello bull" (...)
```

---

## Useful scripts

| Command | What it does |
|---|---|
| `pnpm dev`              | All apps in parallel |
| `pnpm dev:server`       | Fastify only |
| `pnpm dev:mobile`       | Expo only |
| `pnpm dev:worker`       | BullMQ worker only |
| `pnpm dev:web`          | Next.js landing only |
| `pnpm db:migrate`       | Create + apply a new migration (dev) |
| `pnpm db:migrate:deploy`| Apply pending migrations (CI / prod) |
| `pnpm db:studio`        | Prisma Studio |
| `pnpm db:reset`         | Drop + recreate DB (destructive) |
| `pnpm docker:up`        | Start Postgres + Redis containers |
| `pnpm docker:down`      | Stop them |
| `pnpm typecheck`        | Typecheck the whole graph |
| `pnpm build`            | Build everything (server, web, packages) |

---

## Deployment

- **API + Worker**: Railway. `railway.toml` is wired for the API service. Add a
  second Railway service for the worker, with start command
  `pnpm --filter @kairo/queue start`. Provision Postgres + Redis plugins.
- **Mobile**: EAS Build. `apps/mobile/eas.json` defines `development`,
  `preview`, and `production` profiles. Set `EAS_PROJECT_ID` and the platform
  client IDs as EAS secrets.
- **Landing site**: Vercel or Railway. `apps/web` is a stock Next.js 15 app.

---

## Current plan

Follow [`ROADMAP.md`](./ROADMAP.md):

1. **M0** — Align docs/issues, soft-reset Expo shell, ship Better Auth  
2. **M1** — Onboarding (timezone + sports)  
3. **M2** — F1 ingest → Today → pre-event Expo Push  

WhatsApp, Claude AI copy, and Google Calendar are explicitly later (M4).
