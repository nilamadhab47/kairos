-- AlterTable
ALTER TABLE "notification_preferences" ALTER COLUMN "brief_time" SET DEFAULT '08:00'::time,
ALTER COLUMN "dnd_start" SET DEFAULT '23:00'::time,
ALTER COLUMN "dnd_end" SET DEFAULT '07:00'::time;

-- RenameIndex
ALTER INDEX "matches_sport_id_competition_id_home_team_id_away_team_id_st_ke" RENAME TO "matches_sport_id_competition_id_home_team_id_away_team_id_s_key";
