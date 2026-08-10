-- AlterTable
ALTER TABLE "notification_preferences" ALTER COLUMN "brief_time" SET DEFAULT '08:00'::time,
ALTER COLUMN "dnd_start" SET DEFAULT '23:00'::time,
ALTER COLUMN "dnd_end" SET DEFAULT '07:00'::time;

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "message" TEXT NOT NULL,
    "match_id" TEXT,
    "event_id" TEXT,
    "sport_id" VARCHAR(20),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "app_version" VARCHAR(40),
    "platform" VARCHAR(20),
    "timezone" VARCHAR(64),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_feedback_user_recent" ON "feedback"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_feedback_kind_status" ON "feedback"("kind", "status");

-- CreateIndex
CREATE INDEX "idx_feedback_match" ON "feedback"("match_id");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
