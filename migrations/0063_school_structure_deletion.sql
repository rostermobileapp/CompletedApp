-- Explicit owner-approved external Supabase update only; never startup DDL.
-- Retain identity anchors and historical records, not active access.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE hs_onboarding.schools ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE hs_onboarding.programs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE hs_onboarding.teams ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMIT;
