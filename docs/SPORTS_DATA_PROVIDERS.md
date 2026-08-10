# Sports data providers — free & cheap

Verified from public pricing pages (Aug 2026). Prefer **one adapter per sport** behind Kairo’s internal catalog.

## Logos / trademarks (important)

A footer like *“All trademarks belong to their respective owners. Used for identification only.”* is **good practice** and matches how API-Sports positions media — but it **does not** grant a trademark license.

- **OK for MVP:** show logos for identification in-app, cache them, add an explicit attribution disclaimer in Settings / About.
- **Not enough alone:** if a league/club objects, we may need to remove assets or license them.
- **Never:** sell merch with club crests, imply official partnership, or invent “fake” logos.

Kairo approach: use API-provided logo URLs + disclaimer + `assets.license_note`; swap to official kits later if needed.

---

## Free / cheap APIs by sport

### Football (soccer) — **you have this**

| Provider | Free | Cheap paid | Notes |
|---|---|---|---|
| **API-Football (API-Sports)** | 100 req/day, all endpoints | Pro ~$19/mo (7.5k/day) | Key: `API_FOOTBALL_KEY`. Logos via media CDN (quota-free, rate-limited). |
| football-data.org | Free tier (limited) | Paid tiers | Good secondary; thinner coverage than API-Football |

### Formula 1 — **already wired**

| Provider | Free | Notes |
|---|---|---|
| **OpenF1** | No API key | Schedule/sessions/telemetry. Keep as primary. |
| API-Sports Formula-1 | 100 req/day Free on dashboard | Optional backup if OpenF1 gaps appear |

### Cricket — **get this next (recommended)**

| Provider | Free | Cheap paid | Get key |
|---|---|---|---|
| **CricketData.org (CricAPI)** | **Lifetime free: 100 hits/day**, all API surface, near-live (minutes behind) | S $5.99 (2k/day) · M $12.99 · L $29.99 · U $64.99 | [cricketdata.org/signup](https://cricketdata.org/signup.aspx) → paste as `CRICKETDATA_API_KEY` |
| Sportmonks Cricket | 14-day trial | From ~€29/mo | Higher quality / more leagues when we scale |
| EntitySport | Dev sample token only | From ~$150/mo | Too expensive for MVP |

**Please create a free CricketData.org account and add to `.env`:**

```bash
CRICKETDATA_API_KEY=your_key_here
CRICKETDATA_BASE_URL=https://api.cricapi.com/v1
```

### Tennis

| Provider | Free | Cheap paid |
|---|---|---|
| Tennis API (RapidAPI) | Tiny free (~99 req/mo on Basic) | Pro ~$8–10/mo for ~10k |
| Postpone until after cricket | | |

### Basketball / other (API-Sports siblings)

Your dashboard Free already includes Basketball, NBA, NFL, Baseball, Hockey, Rugby, Volleyball, Handball, MMA, Formula-1 — **each ~100 req/day**. Same key pattern (`x-apisports-key`) on sport-specific hosts. Wire only when product demand exists.

---

## What we need from you (priority)

1. ~~`API_FOOTBALL_KEY`~~ — saved  
2. **`CRICKETDATA_API_KEY`** — free signup (cricket)  
3. Optional: `TELEGRAM_BOT_TOKEN` when we start notifications Phase 2  
4. Optional: `EXPO_ACCESS_TOKEN` for prod push  

Do **not** buy EntitySport / Sportradar until product is validated.
