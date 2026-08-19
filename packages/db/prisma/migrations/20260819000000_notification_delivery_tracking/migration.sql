-- Delivery-level tracking for push notifications.
-- Every column is nullable / defaulted so this is safe to apply on live data.
ALTER TABLE "notifications"
  ADD COLUMN "ticket_id"          VARCHAR(64),
  ADD COLUMN "ticket_status"      VARCHAR(20),
  ADD COLUMN "ticket_error"       VARCHAR(64),
  ADD COLUMN "receipt_status"     VARCHAR(20),
  ADD COLUMN "receipt_error"      VARCHAR(64),
  ADD COLUMN "receipt_checked_at" TIMESTAMPTZ(6),
  ADD COLUMN "attempt_count"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_attempts"  JSONB;

CREATE INDEX "idx_notif_ticket" ON "notifications" ("ticket_id");
