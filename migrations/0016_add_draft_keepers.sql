-- Draft Keepers (Task #176)
-- Adds the draft_keepers table for designating players who skip the draft
-- and stay on their assigned team. Supports both real user accounts and
-- placeholder/imported players.

CREATE TABLE IF NOT EXISTS "draft_keepers" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_id" varchar NOT NULL REFERENCES "drafts"("id") ON DELETE CASCADE,
  "user_id" varchar REFERENCES "users"("id") ON DELETE CASCADE,
  "placeholder_player_id" varchar,
  "team_id" varchar NOT NULL REFERENCES "teams"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_draft_keepers_draft" ON "draft_keepers" ("draft_id");

-- If upgrading from an earlier version of the table that had user_id NOT NULL
-- and the unique constraint, run the following:
-- ALTER TABLE draft_keepers ALTER COLUMN user_id DROP NOT NULL;
-- ALTER TABLE draft_keepers ADD COLUMN IF NOT EXISTS placeholder_player_id varchar;
-- ALTER TABLE draft_keepers DROP CONSTRAINT IF EXISTS draft_keepers_draft_user_unique;
