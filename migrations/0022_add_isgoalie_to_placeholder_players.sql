ALTER TABLE "placeholder_players" ADD COLUMN IF NOT EXISTS "is_goalie" boolean NOT NULL DEFAULT false;
ALTER TABLE "placeholder_players" ADD COLUMN IF NOT EXISTS "is_skater" boolean NOT NULL DEFAULT true;
