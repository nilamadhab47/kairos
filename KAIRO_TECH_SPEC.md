# Kairo — Technical Specification

> "The right moment, not just the right time."
> Smart event aggregator with AI-powered contextual notifications.

> **Status (2026-08-07):** Sections **§2 (tech stack)** and **§11 (project structure)** are **superseded** by [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`ROADMAP.md`](./ROADMAP.md).
> This document remains useful for product vision, domain schema (§7), and notification design — but do **not** treat PWA-primary, NextAuth, FCM, or Clerk as current decisions.
> Client = **Expo**; Auth = **Better Auth** on Fastify; Push = **Expo Push** first.

---

## 1. Product overview

Kairo aggregates events from sports APIs, Google Calendar, YouTube live streams, and personal habits into a single timeline. It delivers context-aware notifications via WhatsApp, push notifications, and an in-app calendar — replacing the noise of 50+ daily notifications with 3-4 that actually matter.

### Core value proposition

- One glance = your entire day (morning brief)
- Context-aware copy: "Lights out in 15" not "Reminder: F1 race at 12:30"
- Cross-device: WhatsApp + PWA + push covers Android, iOS, Mac, Windows
- Under 30 seconds from install to first configured briefing

---

## 2. Tech stack

| Layer | Technology | Reasoning |
|---|---|---|
| Frontend (Web) | Next.js 15 + React 19 | SSR for SEO, PWA support, already familiar |
| Styling | TailwindCSS + DM Sans | Matches Kairo design system from DESIGN.md |
| Mobile | PWA (primary) + React Native (v2) | PWA covers 90% of use cases, RN for v2 native push |
| Backend API | Node.js + Express/Fastify | Lightweight, fast, good for cron-heavy workloads |
| Database | PostgreSQL 16 | Relational data, complex queries on events/schedules |
| Cache / Queue | Redis (Upstash) | Job scheduling, rate limiting, API response caching |
| Job Scheduler | BullMQ on Redis | Reliable delayed jobs for notification delivery |
| Hosting | Railway | Already using it, supports Node + Postgres + Redis |
| Auth | NextAuth.js (Google OAuth) | Single sign-on since we need Google Calendar anyway |
| AI Copy | Claude Sonnet API | Contextual notification copy generation |
| WhatsApp | WhatsApp Business API (via Twilio) | Morning briefings, event alerts |
| Push Notifications | Firebase Cloud Messaging (FCM) | Cross-platform push for PWA + mobile |
| Monitoring | Sentry + Railway metrics | Error tracking, uptime |

---

## 3. System architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐  │
│  │ PWA      │  │ WhatsApp     │  │ Push      │  │ Telegram  │  │
│  │ (Web)    │  │ (Twilio)     │  │ (FCM)     │  │ (Bot)     │  │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  └─────┬─────┘  │
└───────┼────────────────┼────────────────┼──────────────┼────────┘
        │                │                │              │
        ▼                ▼                ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                              │
│                    (Fastify + Auth)                              │
│                                                                 │
│  /api/events    /api/user    /api/notifications    /api/habits   │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CORE SERVICES                              │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Event Ingestion │  │ Notification     │  │ AI Copy       │  │
│  │ Service         │  │ Engine           │  │ Service       │  │
│  │                 │  │                  │  │               │  │
│  │ • Sports APIs   │  │ • Job scheduler  │  │ • Claude API  │  │
│  │ • Google Cal    │  │ • Delivery       │  │ • Context     │  │
│  │ • YouTube API   │  │ • Rate limiter   │  │   enrichment  │  │
│  │ • Habit tracker │  │ • Channel router │  │ • Copy cache  │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────┬────────┘  │
│           │                    │                    │           │
│           ▼                    ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              DATA LAYER                                    ││
│  │                                                            ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     ││
│  │  │ PostgreSQL   │  │ Redis        │  │ S3 / R2      │     ││
│  │  │              │  │              │  │              │     ││
│  │  │ • Users      │  │ • Job queue  │  │ • Team logos │     ││
│  │  │ • Events     │  │ • API cache  │  │ • Assets     │     ││
│  │  │ • Notifs     │  │ • Rate limit │  │              │     ││
│  │  │ • Habits     │  │ • Sessions   │  │              │     ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL DATA SOURCES                        │
│                                                                 │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ API-       │ │ OpenF1 / │ │ YouTube  │ │ Google          │  │
│  │ Football   │ │ Ergast   │ │ Data API │ │ Calendar API    │  │
│  └────────────┘ └──────────┘ └──────────┘ └─────────────────┘  │
│  ┌────────────┐ ┌──────────┐ ┌─────────────────────────────┐   │
│  │ Cricbuzz / │ │ Web      │ │ Twilio (WhatsApp Business)  │   │
│  │ CricAPI    │ │ Search   │ │ FCM (Push notifications)    │   │
│  └────────────┘ └──────────┘ └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Core services deep dive

### 4.1 Event Ingestion Service

Pulls events from external sources and normalizes them into a unified event format.

**Sports data pipeline:**

```
Cron (every 6 hours) → Fetch fixtures from APIs → Normalize
→ Deduplicate → Store in events table → Schedule notifications
```

| Source | API | Data | Refresh rate |
|---|---|---|---|
| Football | API-Football (RapidAPI) | Fixtures, standings, live scores | 6h fixtures, 1m live |
| Formula 1 | OpenF1 API | Race schedule, quali, practice | 24h schedule, live during race |
| Cricket | CricAPI | Matches, series, live scores | 6h fixtures, 2m live |
| Tennis | API-Sports Tennis | Grand slam schedule, ATP | 12h |
| Google Calendar | Google Calendar API v3 | User meetings, events | Webhook (real-time) |
| YouTube | YouTube Data API v3 | Channel live streams, premieres | 1h per subscribed channel |

**Normalized event schema:**

```typescript
interface KairoEvent {
  id: string;
  source: 'football' | 'f1' | 'cricket' | 'tennis' | 'calendar' | 'youtube' | 'habit';
  category: 'football' | 'f1' | 'cricket' | 'tennis' | 'work' | 'stream' | 'personal';
  title: string;                    // "Barca vs Atletico Madrid"
  subtitle: string;                 // "La Liga · Camp Nou"
  startsAt: Date;                   // UTC
  endsAt: Date;                     // UTC
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  metadata: Record<string, any>;    // sport-specific: standings, weather, etc.
  contextTags: string[];            // ["el_clasico", "title_decider", "rivalry"]
  sourceEventId: string;            // external API's ID for dedup
}
```

### 4.2 Notification Engine

The brain of the app. Decides when, where, and what to send.

**Notification lifecycle:**

```
Event ingested
  → Schedule notification jobs (BullMQ delayed jobs)
    → Morning brief job: 8:00 AM user timezone
    → Pre-event job: 15 min before event start
    → Live-now job: at event start time
  → When job fires:
    → Check user preferences (channels, DND hours)
    → Call AI Copy Service for contextual message
    → Route to delivery channel(s)
    → Log delivery status
```

**Rate limiting rules:**

- Max 4 push notifications per user per day
- Max 1 morning brief per day
- No notifications between 11 PM and 7 AM (user configurable)
- Merge overlapping events into single notification
- Priority: live sports > meetings (15 min) > streams > habits

**Channel routing logic:**

```typescript
function routeNotification(user: User, event: KairoEvent, type: NotifType): Channel[] {
  const channels: Channel[] = [];

  if (type === 'morning_brief') {
    if (user.channels.whatsapp) channels.push('whatsapp');
    else if (user.channels.telegram) channels.push('telegram');
    else channels.push('push');
  }

  if (type === 'pre_event' || type === 'live_now') {
    if (user.channels.push) channels.push('push');
    // Also WhatsApp for high-priority events
    if (event.contextTags.includes('title_decider') ||
        event.contextTags.includes('season_finale')) {
      if (user.channels.whatsapp) channels.push('whatsapp');
    }
  }

  return channels;
}
```

### 4.3 AI Copy Service

Generates contextual, sport-native notification copy using Claude API.

**Context enrichment pipeline:**

```
Event data
  → Fetch standings (is it a title decider?)
  → Fetch head-to-head (is it a rivalry?)
  → Fetch weather (rain in Monaco?)
  → Fetch recent news (injury updates?)
  → Package as context object
  → Send to Claude Sonnet
  → Cache generated copy (1 hour TTL)
```

**Claude API prompt template:**

```typescript
const systemPrompt = `You write push notification copy for a sports fan's
personal event app called Kairo. Rules:
- One line, max 60 characters
- Use the sport's own language (F1: "lights out", football: "walking out")
- Create urgency without clickbait
- Reference stakes if they matter (title race, streak, records)
- No emojis
- Sound like a knowledgeable friend texting, not a calendar
- For non-sports events, still be human and contextual`;

const userPrompt = `Generate notification copy for:
Event: ${event.title}
Sport: ${event.category}
Competition: ${event.metadata.competition}
Stakes: ${contextData.stakes}
Time until: ${minutesUntil} minutes
Extra context: ${contextData.extras}

Return ONLY the notification text, nothing else.`;
```

**Cost estimation:**

- Sonnet input: ~200 tokens per call
- Sonnet output: ~20 tokens per call
- Cost per notification: ~$0.0003
- 4 notifications/day × 30 days = 120 calls/month/user
- Monthly cost per user: ~$0.036

### 4.4 Habit Tracking Service

Lightweight habit tracking integrated into the event timeline.

```typescript
interface Habit {
  id: string;
  userId: string;
  title: string;           // "Japanese practice"
  category: 'personal';
  scheduledTime: string;    // "08:00"
  durationMinutes: number;  // 10
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
  currentStreak: number;    // 34
  longestStreak: number;    // 34
  completedToday: boolean;
}
```

---

## 5. Feature list (prioritized)

### MVP (Weekend build)

| # | Feature | Priority | Effort |
|---|---|---|---|
| 1 | Google OAuth sign-in | P0 | 2h |
| 2 | Sport subscription picker (onboarding step 1) | P0 | 3h |
| 3 | Team/series picker (onboarding step 2) | P0 | 3h |
| 4 | Channel connection (onboarding step 3) | P0 | 2h |
| 5 | Football fixture ingestion (API-Football) | P0 | 4h |
| 6 | F1 race schedule ingestion (OpenF1) | P0 | 3h |
| 7 | Google Calendar sync via OAuth | P0 | 4h |
| 8 | Unified event timeline (today view) | P0 | 4h |
| 9 | Morning brief generation + WhatsApp delivery | P0 | 4h |
| 10 | Pre-event push notification (15 min before) | P0 | 3h |
| 11 | AI copy generation via Claude API | P0 | 3h |
| 12 | Timezone auto-detection + conversion | P0 | 1h |

### v1.1 (Week 2)

| # | Feature | Priority | Effort |
|---|---|---|---|
| 13 | Cricket match ingestion | P1 | 3h |
| 14 | YouTube live stream tracking | P1 | 4h |
| 15 | Habit tracker with streaks | P1 | 4h |
| 16 | Week view on calendar | P1 | 3h |
| 17 | Desktop sidebar layout | P1 | 4h |
| 18 | Notification history / alerts tab | P1 | 2h |
| 19 | Event detail panel with AI insight | P1 | 3h |
| 20 | Telegram bot as alternative channel | P1 | 4h |

### v1.2 (Week 3-4)

| # | Feature | Priority | Effort |
|---|---|---|---|
| 21 | Live score cards (football, cricket) | P2 | 6h |
| 22 | Tennis grand slam tracking | P2 | 3h |
| 23 | Multiple timezone support | P2 | 2h |
| 24 | Notification preferences per category | P2 | 3h |
| 25 | DND hours configuration | P2 | 2h |
| 26 | Share event with friends | P2 | 3h |
| 27 | PWA install prompt + offline mode | P2 | 4h |
| 28 | Monthly event heatmap | P2 | 3h |

---

## 6. API routes

```
Authentication
  POST   /api/auth/google              Google OAuth callback
  GET    /api/auth/session              Current session
  POST   /api/auth/logout               Logout

User
  GET    /api/user/profile              Get user profile + prefs
  PATCH  /api/user/profile              Update timezone, name
  PUT    /api/user/channels             Update notification channels
  GET    /api/user/subscriptions        Get sport/team subscriptions
  PUT    /api/user/subscriptions        Update subscriptions

Events
  GET    /api/events/today              Today's events for user
  GET    /api/events/week               This week's events
  GET    /api/events/:id                Event detail + AI insight
  GET    /api/events/live               Currently live events
  POST   /api/events/custom             Add custom event

Habits
  GET    /api/habits                    List user habits
  POST   /api/habits                    Create habit
  PATCH  /api/habits/:id                Update habit
  POST   /api/habits/:id/complete       Mark today complete
  DELETE /api/habits/:id                Delete habit

Notifications
  GET    /api/notifications/history     Past notifications
  GET    /api/notifications/brief       Today's morning brief
  PATCH  /api/notifications/settings    Update notif preferences
  POST   /api/notifications/test        Send test notification

Sources
  POST   /api/sources/google-calendar   Connect Google Calendar
  POST   /api/sources/youtube           Add YouTube channels
  DELETE /api/sources/:id               Disconnect source
  GET    /api/sources                   List connected sources
```

---

## 7. Database schema

```sql
-- ============================================
-- USERS
-- ============================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  name            VARCHAR(255),
  avatar_url      TEXT,
  timezone        VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  google_token    JSONB,                  -- encrypted OAuth tokens
  onboarding_done BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SUBSCRIPTIONS (what sports/teams user follows)
-- ============================================

CREATE TABLE user_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category        VARCHAR(20) NOT NULL,   -- football, f1, cricket, tennis
  entity_type     VARCHAR(20) NOT NULL,   -- team, league, series, driver
  entity_id       VARCHAR(100) NOT NULL,  -- external API ID
  entity_name     VARCHAR(255) NOT NULL,  -- "FC Barcelona"
  entity_meta     JSONB,                  -- logo_url, colors, abbreviation
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, category, entity_id)
);

CREATE INDEX idx_subs_user ON user_subscriptions(user_id) WHERE is_active = true;

-- ============================================
-- EVENTS (normalized from all sources)
-- ============================================

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(20) NOT NULL,   -- football, f1, calendar, youtube, habit
  category        VARCHAR(20) NOT NULL,   -- football, f1, work, stream, personal
  source_event_id VARCHAR(255),           -- external API's ID for dedup
  title           VARCHAR(500) NOT NULL,
  subtitle        VARCHAR(500),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'upcoming',  -- upcoming, live, completed, cancelled
  metadata        JSONB DEFAULT '{}',     -- sport-specific data
  context_tags    TEXT[] DEFAULT '{}',     -- el_clasico, title_decider, rain
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source, source_event_id)
);

CREATE INDEX idx_events_starts ON events(starts_at);
CREATE INDEX idx_events_status ON events(status) WHERE status IN ('upcoming', 'live');
CREATE INDEX idx_events_source ON events(source);
CREATE INDEX idx_events_tags ON events USING GIN(context_tags);

-- ============================================
-- USER_EVENTS (which events belong to which user)
-- ============================================

CREATE TABLE user_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  is_dismissed    BOOLEAN DEFAULT false,
  is_starred      BOOLEAN DEFAULT false,
  reminder_sent   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, event_id)
);

CREATE INDEX idx_ue_user_event ON user_events(user_id, event_id);
CREATE INDEX idx_ue_upcoming ON user_events(user_id) WHERE is_dismissed = false;

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  type            VARCHAR(20) NOT NULL,   -- morning_brief, pre_event, live_now, habit
  channel         VARCHAR(20) NOT NULL,   -- whatsapp, push, telegram
  title           VARCHAR(255) NOT NULL,  -- "Lights out in 15"
  body            TEXT,                   -- subtitle / detail
  ai_generated    BOOLEAN DEFAULT false,
  status          VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, read
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  error_msg       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notif_scheduled ON notifications(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_notif_status ON notifications(status);

-- ============================================
-- NOTIFICATION PREFERENCES
-- ============================================

CREATE TABLE notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channels        JSONB DEFAULT '{"whatsapp": true, "push": true, "telegram": false}',
  brief_time      TIME DEFAULT '08:00',           -- morning brief time
  max_daily_push  INT DEFAULT 4,
  dnd_start       TIME DEFAULT '23:00',
  dnd_end         TIME DEFAULT '07:00',
  pre_event_mins  INT DEFAULT 15,                 -- reminder X min before
  category_prefs  JSONB DEFAULT '{}',             -- per-category overrides
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HABITS
-- ============================================

CREATE TABLE habits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,   -- "Japanese practice"
  scheduled_time  TIME NOT NULL,           -- 08:00
  duration_mins   INT DEFAULT 10,
  frequency       VARCHAR(20) DEFAULT 'daily', -- daily, weekdays, weekends, custom
  frequency_days  INT[] DEFAULT '{1,2,3,4,5,6,7}', -- 1=Mon, 7=Sun
  current_streak  INT DEFAULT 0,
  longest_streak  INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_habits_user ON habits(user_id) WHERE is_active = true;

-- ============================================
-- HABIT COMPLETIONS
-- ============================================

CREATE TABLE habit_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id        UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  completed_date  DATE NOT NULL,
  completed_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(habit_id, completed_date)
);

CREATE INDEX idx_hc_habit ON habit_completions(habit_id, completed_date DESC);

-- ============================================
-- CONNECTED SOURCES
-- ============================================

CREATE TABLE connected_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type     VARCHAR(20) NOT NULL,    -- google_calendar, youtube, whatsapp
  credentials     JSONB,                   -- encrypted tokens
  config          JSONB DEFAULT '{}',      -- youtube channel IDs, calendar IDs
  is_active       BOOLEAN DEFAULT true,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, source_type)
);

-- ============================================
-- AI COPY CACHE
-- ============================================

CREATE TABLE ai_copy_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  notif_type      VARCHAR(20) NOT NULL,    -- pre_event, live_now
  copy_text       VARCHAR(255) NOT NULL,
  context_hash    VARCHAR(64) NOT NULL,    -- hash of context data for cache busting
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(event_id, notif_type, context_hash)
);

CREATE INDEX idx_cache_expiry ON ai_copy_cache(expires_at);
```

---

## 8. Key flows

### 8.1 Morning brief generation

```
[Cron: daily at user.brief_time per timezone]
    │
    ▼
Query user_events WHERE starts_at = today
    │
    ▼
Query habits WHERE frequency includes today
    │
    ▼
Merge + sort by time
    │
    ▼
For each event: fetch context (standings, streaks)
    │
    ▼
Claude API: generate brief summary line
  ("Race weekend + El Clasico night. Sorted.")
    │
    ▼
Format message with colored dots per category
    │
    ▼
Route to preferred channel
  ├── WhatsApp → Twilio API
  ├── Telegram → Bot API
  └── Push → FCM
    │
    ▼
Log to notifications table
```

### 8.2 Pre-event notification flow

```
[BullMQ: fires 15 min before event.starts_at]
    │
    ▼
Check user still subscribed + event not cancelled
    │
    ▼
Check daily push count < max_daily_push
    │
    ▼
Check not in DND window
    │
    ▼
Fetch context for event
  ├── Football: standings, H2H, stakes
  ├── F1: championship points, quali results, weather
  ├── Cricket: series state, toss result
  └── Meeting: attendees from calendar
    │
    ▼
Check ai_copy_cache for existing copy
  ├── Cache hit → use cached copy
  └── Cache miss → Claude API → cache result
    │
    ▼
Deliver via push notification (FCM)
    │
    ▼
Log to notifications table
```

### 8.3 Event ingestion flow

```
[Cron: every 6 hours]
    │
    ▼
For each active sport source:
    │
    ├── Football: GET /v3/fixtures?next=20&team={teamId}
    ├── F1: GET /v1/sessions?year=2026
    ├── Cricket: GET /matches?status=upcoming
    └── Tennis: GET /fixtures?tournament={id}
    │
    ▼
Normalize to KairoEvent schema
    │
    ▼
Upsert to events table (ON CONFLICT source+source_event_id)
    │
    ▼
For each user subscribed to relevant team/sport:
    │
    ▼
Create user_events record
    │
    ▼
Schedule BullMQ jobs:
  ├── pre_event job (delay: starts_at - 15min - now)
  └── live_now job (delay: starts_at - now)
```

### 8.4 Onboarding flow

```
User opens app
    │
    ▼
Google OAuth (NextAuth)
  → Creates user record
  → Stores Google tokens
    │
    ▼
Step 1: "What do you follow?"
  → POST /api/user/subscriptions
  → {categories: ["football", "f1"]}
    │
    ▼
Step 2: "Pick your teams"
  → GET /api/teams?category=football (search API-Football)
  → PUT /api/user/subscriptions
  → [{category: "football", entity: "FC Barcelona", id: 529}]
    │
    ▼
Step 3: "Connect and go"
  → POST /api/sources/google-calendar (OAuth)
  → PUT /api/user/channels
  → {whatsapp: true, push: true, brief_time: "08:00"}
    │
    ▼
Trigger initial event ingestion for user's teams
    │
    ▼
Show "You're set" screen with tomorrow's preview
    │
    ▼
Schedule first morning brief
```

---

## 9. Cron jobs

| Job | Schedule | Description |
|---|---|---|
| `ingest:football` | Every 6h | Fetch fixtures for all subscribed teams |
| `ingest:f1` | Every 24h (1h on race weekends) | Fetch F1 session schedule |
| `ingest:cricket` | Every 6h | Fetch cricket match schedule |
| `ingest:youtube` | Every 1h | Check subscribed channels for live/upcoming |
| `sync:google-calendar` | Webhook + every 1h fallback | Sync calendar events |
| `notify:morning-brief` | Per user timezone at brief_time | Generate + send daily brief |
| `cleanup:old-events` | Daily at 3 AM | Archive events older than 30 days |
| `cleanup:ai-cache` | Every 1h | Delete expired AI copy cache entries |
| `habits:reset-streak` | Daily at midnight per TZ | Reset streak if yesterday not completed |
| `events:update-status` | Every 1 min | Mark events as live/completed based on time |

---

## 10. Environment variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/kairo

# Redis
REDIS_URL=redis://default:pass@host:6379

# Auth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
NEXTAUTH_SECRET=xxx
NEXTAUTH_URL=https://kairo.app

# External APIs
API_FOOTBALL_KEY=xxx              # RapidAPI key
OPENF1_BASE_URL=https://api.openf1.org/v1
CRICAPI_KEY=xxx
YOUTUBE_API_KEY=xxx

# AI
ANTHROPIC_API_KEY=xxx

# Notifications
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=xxx
FIREBASE_SERVICE_ACCOUNT=xxx      # FCM credentials
TELEGRAM_BOT_TOKEN=xxx

# App
APP_URL=https://kairo.app
NODE_ENV=production
```

---

## 11. Project structure

```
kairo/
├── apps/
│   └── web/                        # Next.js PWA
│       ├── app/
│       │   ├── (auth)/
│       │   │   └── login/
│       │   ├── (app)/
│       │   │   ├── today/           # Timeline home
│       │   │   ├── calendar/        # Week/month view
│       │   │   ├── alerts/          # Notification history
│       │   │   └── settings/
│       │   ├── onboarding/
│       │   │   ├── interests/       # Step 1
│       │   │   ├── teams/           # Step 2
│       │   │   └── connect/         # Step 3
│       │   ├── api/
│       │   │   ├── auth/
│       │   │   ├── events/
│       │   │   ├── habits/
│       │   │   ├── notifications/
│       │   │   └── sources/
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/                  # Design system primitives
│       │   │   ├── EventCard.tsx
│       │   │   ├── CategoryBadge.tsx
│       │   │   ├── NowIndicator.tsx
│       │   │   ├── MorningBrief.tsx
│       │   │   └── Timeline.tsx
│       │   ├── onboarding/
│       │   └── layout/
│       │       ├── Sidebar.tsx      # Desktop
│       │       ├── BottomNav.tsx    # Mobile
│       │       └── EventDetail.tsx  # Right panel
│       ├── lib/
│       │   ├── db.ts               # Prisma client
│       │   ├── redis.ts
│       │   └── auth.ts
│       ├── public/
│       │   ├── manifest.json       # PWA manifest
│       │   ├── sw.js               # Service worker
│       │   └── icons/
│       └── tailwind.config.ts       # Kairo design tokens
│
├── packages/
│   ├── core/                        # Shared business logic
│   │   ├── services/
│   │   │   ├── eventIngestion.ts
│   │   │   ├── notificationEngine.ts
│   │   │   ├── aiCopyService.ts
│   │   │   └── habitTracker.ts
│   │   ├── sources/
│   │   │   ├── football.ts
│   │   │   ├── f1.ts
│   │   │   ├── cricket.ts
│   │   │   ├── youtube.ts
│   │   │   └── googleCalendar.ts
│   │   └── types/
│   │       └── events.ts
│   │
│   ├── db/                          # Prisma schema + migrations
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   └── queue/                       # BullMQ job definitions
│       ├── jobs/
│       │   ├── morningBrief.ts
│       │   ├── preEventNotif.ts
│       │   ├── liveNowNotif.ts
│       │   └── ingestSports.ts
│       └── worker.ts
│
├── docker-compose.yml
├── railway.toml
├── package.json
├── turbo.json                       # Turborepo config
└── DESIGN.md                        # Kairo design system
```

---

## 12. Cost estimation (per 1000 users)

| Service | Monthly cost |
|---|---|
| Railway (Node + Postgres + Redis) | ~$20 |
| API-Football (RapidAPI Pro) | $10 |
| OpenF1 API | Free |
| CricAPI | $15 |
| YouTube Data API | Free (10k quota/day) |
| Google Calendar API | Free |
| Claude Sonnet API (120 calls/user × 1000) | ~$36 |
| Twilio WhatsApp (1 msg/day × 1000) | ~$50 |
| Firebase FCM | Free |
| Cloudflare R2 (assets) | ~$5 |
| **Total** | **~$136/month** |

$0.14 per user per month. At scale, Claude API and Twilio dominate costs.

---

## 13. Security considerations

- Google OAuth tokens encrypted at rest (AES-256)
- All API keys in environment variables, never in code
- Rate limiting on all public endpoints (100 req/min)
- CORS restricted to kairo.app domain
- Webhook signatures verified for Google Calendar
- User data isolated by user_id in all queries
- HTTPS enforced everywhere
- Session tokens httpOnly + secure + sameSite

---

## 14. MVP timeline

| Day | Focus | Deliverable |
|---|---|---|
| Day 1 (Sat AM) | Project setup, auth, DB | Railway deployed, Google OAuth working, DB migrated |
| Day 1 (Sat PM) | Event ingestion | Football + F1 data flowing into events table |
| Day 2 (Sun AM) | Notification engine | Morning brief + pre-event push working |
| Day 2 (Sun PM) | Frontend | Timeline view, onboarding 3 screens |
| Day 3 (Mon) | AI copy + polish | Claude integration, WhatsApp delivery, PWA manifest |
| Day 4 (Tue) | Testing + ship | Bug fixes, deploy, send first real morning brief |
