# Backend integrations — credentials checklist

Use this when wiring third-party APIs. Prefer putting secrets only in root `.env` (never commit). Check live status via `GET /api/admin/integrations`.

## Required now (local vertical loop)

| Integration | Env vars | Where to get it | Notes |
|---|---|---|---|
| Postgres / Redis | `DATABASE_URL`, `REDIS_URL` | Docker Compose already | Already running locally |
| Better Auth | `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL` | Generate secret locally | On device: `BETTER_AUTH_URL` must be LAN IP, not localhost |
| Google Sign-In | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **OAuth client type: Web application** | Authorized redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google` |
| OpenF1 (F1) | `OPENF1_BASE_URL` (optional) | None — [openf1.org](https://openf1.org/) | **No API key.** Free schedule/history. Rate limit ~3 req/s. |
| Expo Push | Device tokens via app; optional `EXPO_ACCESS_TOKEN` | Expo account → Access tokens | Push works without token for light use; token recommended for prod |

## Required for football (M3)

| Integration | Env vars | Where to get it | Notes |
|---|---|---|---|
| API-Football | `API_FOOTBALL_KEY`, optional `API_FOOTBALL_BASE_URL` | [dashboard.api-football.com](https://dashboard.api-football.com/) (API-Sports) | Header `x-apisports-key`. Free tier is rate-limited. Default league ingest: EPL `39`. |

Without this key, football team search falls back to a static popular list and football ingest is skipped.

**Free-plan constraints (verified):** seasons ~2022–2024 only; \`next\` filter blocked — ingest uses \`from\`/\`to\` windows. For current seasons, upgrade to Pro (~\$19/mo).

## Optional / later (not blocking Today + push)

| Integration | Env vars | Status in codebase |
|---|---|---|
| OpenRouter | `OPEN_ROUTER_API_KEY` | Slot ready; AI copy still uses templates |
| Anthropic | `ANTHROPIC_API_KEY` | Slot ready; unused until AI copy ships |
| Twilio WhatsApp | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | Deferred (MVP = Expo push) |
| Google Calendar | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | `POST /api/sources/google-calendar` returns 501 until implemented |
| Apple Sign-In | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | Needed before iOS App Store if Google social is enabled |
| Sentry | `SENTRY_DSN` | Not wired yet |

## What you should create / paste next

1. **Confirm Google Web OAuth client** (not Android-only) + redirect URI matching your `BETTER_AUTH_URL`.
2. **API-Football key** — saved in `.env` when ready.
3. **CricketData.org free key** for cricket — see [`docs/SPORTS_DATA_PROVIDERS.md`](./SPORTS_DATA_PROVIDERS.md).
4. **Expo access token** (optional but good) from Expo dashboard.
5. Leave WhatsApp / Calendar / Anthropic empty until we turn those features on.
6. Logos: attribution disclaimer in-app; does **not** replace trademark rights — see sports providers doc.

## Scalar docs

With the API running:

- Interactive docs: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/openapi.json`

To try authenticated routes: sign in via Better Auth, then Authorize in Scalar with `Bearer <session token>`.

## Admin ingest (dev)

```bash
curl -X POST http://localhost:4000/api/admin/ingest \
  -H 'content-type: application/json' \
  -d '{"sources":["f1"],"sync":true}'
```

Run the worker in another terminal: `pnpm dev:worker`.
