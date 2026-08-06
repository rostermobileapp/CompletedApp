CREATE TABLE IF NOT EXISTS "league_invites_sent" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "league_id" varchar NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "method" varchar(10) NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "unique_league_invite" UNIQUE("league_id","user_id")
);

CREATE INDEX IF NOT EXISTS "idx_league_invites_league" ON "league_invites_sent" ("league_id");
