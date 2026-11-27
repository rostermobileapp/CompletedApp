-- Explicit external Supabase migration. Apply only after owner approval.
-- Existing programs/teams/memberships retain their identities and authority.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS hs_onboarding.schools (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  town text NOT NULL CHECK(length(trim(town)) BETWEEN 1 AND 100),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hs_onboarding.schools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_onboarding.schools FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
ALTER TABLE hs_onboarding.programs
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES hs_onboarding.schools(id);
-- Do not guess which historic school names represent the same institution.
-- Use the existing program UUID as the initial school UUID for repeatability;
-- these are different entity types, and programs retain their original UUIDs.
INSERT INTO hs_onboarding.schools(id,name,town,created_by)
  SELECT id,name,town,requested_by FROM hs_onboarding.programs WHERE school_id IS NULL
  ON CONFLICT(id) DO NOTHING;
UPDATE hs_onboarding.programs SET school_id=id WHERE school_id IS NULL;
-- Nullable during the rolling upgrade: older intake writers can still create a
-- record. Management exposes those as "School not linked" for explicit repair.
-- The former uniqueness key conflated different schools in the same town.
ALTER TABLE hs_onboarding.programs DROP CONSTRAINT IF EXISTS programs_league_id_name_town_key;
CREATE UNIQUE INDEX IF NOT EXISTS programs_league_school_name_unique
  ON hs_onboarding.programs(league_id,school_id,lower(trim(name)));
CREATE INDEX IF NOT EXISTS programs_school_id_idx ON hs_onboarding.programs(school_id);
CREATE INDEX IF NOT EXISTS schools_created_by_idx ON hs_onboarding.schools(created_by);
COMMIT;
