-- Phase 1 — normalized display metadata + team type.
--
-- All columns are additive & nullable; existing rows keep working with NULL.
-- A backfill script (packages/db/scripts/backfill-competitions.ts) will populate
-- these based on the raw provider `name` and `metadata` we already store.

ALTER TABLE "competitions"
  ADD COLUMN "display_name" VARCHAR(255),
  ADD COLUMN "gender"       VARCHAR(20),
  ADD COLUMN "format"       VARCHAR(30),
  ADD COLUMN "season_label" VARCHAR(50);

ALTER TABLE "teams"
  ADD COLUMN "type" VARCHAR(30);

-- Fast picker path: "give me the top-tier active competitions for a sport".
CREATE INDEX IF NOT EXISTS "idx_comp_sport_active_tier"
  ON "competitions" ("sport_id", "is_active", "tier");
