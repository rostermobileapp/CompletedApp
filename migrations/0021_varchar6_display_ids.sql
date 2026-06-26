-- Normalise display ID columns to varchar(6) to match the U/L/T##### format
-- All existing rows were backfilled to 6-char values before this migration runs.
ALTER TABLE "leagues" ALTER COLUMN "unique_league_id" TYPE varchar(6);
ALTER TABLE "teams"   ALTER COLUMN "unique_team_id"   TYPE varchar(6);
