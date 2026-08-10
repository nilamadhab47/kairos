-- Normalized sports domain models

CREATE TABLE "sports" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "sport_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(100),
    "country" VARCHAR(100),
    "logo_url" TEXT,
    "season" VARCHAR(20),
    "tier" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "provider_refs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "sport_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(50),
    "country" VARCHAR(100),
    "logo_url" TEXT,
    "provider_refs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_competitions" (
    "team_id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    CONSTRAINT "team_competitions_pkey" PRIMARY KEY ("team_id", "competition_id")
);

CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "sport_id" VARCHAR(30) NOT NULL,
    "team_id" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "position" VARCHAR(50),
    "nationality" VARCHAR(100),
    "image_url" TEXT,
    "provider_refs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "sport_id" VARCHAR(30) NOT NULL,
    "competition_id" TEXT NOT NULL,
    "home_team_id" TEXT,
    "away_team_id" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "home_score" INTEGER,
    "away_score" INTEGER,
    "venue" VARCHAR(255),
    "round" VARCHAR(100),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "provider_refs" JSONB NOT NULL DEFAULT '[]',
    "last_synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "match_events" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "minute" INTEGER,
    "type" VARCHAR(30) NOT NULL,
    "team" VARCHAR(10),
    "player_name" VARCHAR(255),
    "detail" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "standings" (
    "id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    "season" VARCHAR(20) NOT NULL,
    "last_synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "standings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "standing_rows" (
    "id" TEXT NOT NULL,
    "standing_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "drawn" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "goals_for" INTEGER NOT NULL DEFAULT 0,
    "goals_against" INTEGER NOT NULL DEFAULT 0,
    "goal_difference" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "form" VARCHAR(20),
    CONSTRAINT "standing_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "asset_type" VARCHAR(30) NOT NULL,
    "url" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "idx_competitions_sport" ON "competitions"("sport_id");
CREATE UNIQUE INDEX "competitions_sport_id_name_season_key" ON "competitions"("sport_id", "name", "season");

CREATE INDEX "idx_teams_sport" ON "teams"("sport_id");
CREATE UNIQUE INDEX "teams_sport_id_name_key" ON "teams"("sport_id", "name");

CREATE INDEX "idx_players_team" ON "players"("team_id");
CREATE INDEX "idx_players_sport" ON "players"("sport_id");

CREATE INDEX "idx_matches_starts" ON "matches"("starts_at");
CREATE INDEX "idx_matches_status" ON "matches"("status");
CREATE INDEX "idx_matches_sport_date" ON "matches"("sport_id", "starts_at");
CREATE INDEX "idx_matches_competition" ON "matches"("competition_id");
CREATE UNIQUE INDEX "matches_sport_id_competition_id_home_team_id_away_team_id_st_key" ON "matches"("sport_id", "competition_id", "home_team_id", "away_team_id", "starts_at");

CREATE INDEX "idx_match_events_match" ON "match_events"("match_id");

CREATE UNIQUE INDEX "standings_competition_id_season_key" ON "standings"("competition_id", "season");

CREATE UNIQUE INDEX "standing_rows_standing_id_team_id_key" ON "standing_rows"("standing_id", "team_id");
CREATE INDEX "idx_standing_rows_pos" ON "standing_rows"("standing_id", "position");

CREATE UNIQUE INDEX "assets_entity_type_entity_id_asset_type_provider_key" ON "assets"("entity_type", "entity_id", "asset_type", "provider");
CREATE INDEX "idx_assets_entity" ON "assets"("entity_type", "entity_id");

-- Foreign keys
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_competitions" ADD CONSTRAINT "team_competitions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_competitions" ADD CONSTRAINT "team_competitions_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "players" ADD CONSTRAINT "players_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "standings" ADD CONSTRAINT "standings_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standing_rows" ADD CONSTRAINT "standing_rows_standing_id_fkey" FOREIGN KEY ("standing_id") REFERENCES "standings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "standing_rows" ADD CONSTRAINT "standing_rows_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default sports
INSERT INTO "sports" ("id", "name", "sort_order") VALUES
  ('football', 'Football', 1),
  ('cricket', 'Cricket', 2),
  ('f1', 'Formula 1', 3),
  ('tennis', 'Tennis', 4),
  ('basketball', 'Basketball', 5),
  ('hockey', 'Ice Hockey', 6),
  ('baseball', 'Baseball', 7);
