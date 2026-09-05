-- Personal ICS calendar-subscription feed token (Google/Apple/Outlook "add by URL").
ALTER TABLE "user" ADD COLUMN "calendar_token" TEXT;
CREATE UNIQUE INDEX "user_calendar_token_key" ON "user"("calendar_token");
