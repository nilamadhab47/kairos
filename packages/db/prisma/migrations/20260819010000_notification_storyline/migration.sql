-- Storyline metadata for multi-stage push notifications.
ALTER TABLE "notifications"
  ADD COLUMN "candidates"        JSONB,
  ADD COLUMN "importance_score"  INTEGER;
