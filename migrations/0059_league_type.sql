-- Additive classification only. No role, team, child, billing or rollout changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS league_type varchar NOT NULL DEFAULT 'adult';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.leagues'::regclass AND conname='leagues_league_type_check'
  ) THEN
    ALTER TABLE public.leagues ADD CONSTRAINT leagues_league_type_check
      CHECK (league_type IN ('adult','high_school','youth'));
  END IF;
END $$;
COMMIT;
