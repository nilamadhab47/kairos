-- Capped unique-error log (max ~100 rows, enforced in app code).
CREATE TABLE "app_errors" (
    "id" TEXT NOT NULL,
    "fingerprint" VARCHAR(32) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "message" VARCHAR(400) NOT NULL,
    "stack" VARCHAR(1200),
    "path" VARCHAR(180),
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_errors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_errors_fingerprint_key" ON "app_errors"("fingerprint");
CREATE INDEX "idx_app_errors_last_seen" ON "app_errors"("last_seen_at");
