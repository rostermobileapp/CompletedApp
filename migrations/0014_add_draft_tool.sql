-- Roster Draft Tool (Task #137)
-- Adds the schema needed for the multi-step draft setup wizard and live draft room:
--   * extends draft_status enum with pending / active / paused
--   * adds new columns to existing `drafts` and `draft_picks` tables
--   * creates `draft_buddy_pairs` and `draft_chat_messages` tables

-- 1) Extend draft_status enum.
--    Existing values: created, in_progress, completed, cancelled.
--    New values consumed by the engine: pending (default for new drafts),
--    active (running), paused (commissioner pause).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'draft_status')) THEN
    ALTER TYPE draft_status ADD VALUE 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'active'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'draft_status')) THEN
    ALTER TYPE draft_status ADD VALUE 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'paused'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'draft_status')) THEN
    ALTER TYPE draft_status ADD VALUE 'paused';
  END IF;
END$$;

-- 2) New columns on `drafts`.
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS season_id            varchar REFERENCES seasons(id),
  ADD COLUMN IF NOT EXISTS draft_style          varchar,
  ADD COLUMN IF NOT EXISTS goalie_method        varchar DEFAULT 'included_with_skaters',
  ADD COLUMN IF NOT EXISTS timer_expiry_rule    varchar DEFAULT 'auto_pick',
  ADD COLUMN IF NOT EXISTS skill_ranking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skill_scale          varchar,
  ADD COLUMN IF NOT EXISTS player_notes         jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS goalie_assignments   jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS forfeited_rounds     jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_turn_deadline timestamp,
  ADD COLUMN IF NOT EXISTS next_timer_override  integer,
  ADD COLUMN IF NOT EXISTS locked_at            timestamp;

-- 3) New columns on `draft_picks`.
ALTER TABLE draft_picks
  ADD COLUMN IF NOT EXISTS pick_in_round    integer,
  ADD COLUMN IF NOT EXISTS is_auto_buddy    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expired_auto_pick boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forfeited        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS picked_at        timestamp;

-- Backfill pick_in_round for any pre-existing rows (mirrors `pick`).
UPDATE draft_picks SET pick_in_round = pick WHERE pick_in_round IS NULL;
ALTER TABLE draft_picks ALTER COLUMN pick_in_round SET NOT NULL;

-- 4) Buddy pairs.
CREATE TABLE IF NOT EXISTS draft_buddy_pairs (
  id        varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id  varchar NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  user_ids  text[]  NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_draft_buddy_pairs_draft ON draft_buddy_pairs(draft_id);

-- 5) Chat messages.
CREATE TABLE IF NOT EXISTS draft_chat_messages (
  id        varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id  varchar NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  user_id   varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body      text    NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_draft_chat_messages_draft ON draft_chat_messages(draft_id);
