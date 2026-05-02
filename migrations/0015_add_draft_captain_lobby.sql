-- Roster Draft Tool — captain READY lobby + buzzer extension
--
-- Extends the existing draft tool with:
--   * a new `awaiting_captains` value on the draft_status enum (lobby phase
--     between commissioner clicking Start and the first pick)
--   * `buzzer_extension_state` jsonb column on drafts for the halve_next
--     timer-expiry rule (tracks current-pick extension + halved-next-turn map)
--   * `captain_ready_state` jsonb column on drafts for the lobby ready map

-- 1) Extend draft_status enum with the lobby value.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumlabel = 'awaiting_captains'
                   AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'draft_status')) THEN
    ALTER TYPE draft_status ADD VALUE 'awaiting_captains';
  END IF;
END$$;

-- 2) New jsonb columns on drafts.
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS buzzer_extension_state jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS captain_ready_state    jsonb DEFAULT '{}'::jsonb;
