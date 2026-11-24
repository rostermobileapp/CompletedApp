-- Explicit isolated DEV install only; never run from startup or publish.
BEGIN;
DO $$ BEGIN
  IF current_setting('roster.hs_family_dev',true) IS DISTINCT FROM 'family-setup' THEN
    RAISE EXCEPTION 'Explicit isolated DEV family connection required';
  END IF;
  IF to_regclass('hs_onboarding.staff_version') IS NULL THEN
    RAISE EXCEPTION 'Install the approved staff foundation first';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS hs_onboarding.family_version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.family_version VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS hs_onboarding.family_flows(
  auth_id uuid PRIMARY KEY REFERENCES hs_parent_security.accounts(auth_id),
  adult_user_id varchar NOT NULL REFERENCES public.users(id),
  path text NOT NULL DEFAULT 'parent' CHECK(path='parent'),
  block_legacy boolean NOT NULL DEFAULT false CHECK(NOT block_legacy),
  revision integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',draft jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now());
-- A child join belongs to the authenticated guardian, not to whichever
-- signup journey originally created that account. Preserve all existing rows.
ALTER TABLE hs_onboarding.player_requests
  DROP CONSTRAINT IF EXISTS player_requests_auth_id_fkey;
ALTER TABLE hs_onboarding.player_requests ADD CONSTRAINT player_requests_auth_id_fkey
  FOREIGN KEY(auth_id) REFERENCES auth.users(id);
ALTER TABLE hs_onboarding.player_requests ADD COLUMN IF NOT EXISTS decided_by uuid;
ALTER TABLE hs_onboarding.player_requests ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE hs_onboarding.family_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_onboarding.family_flows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_onboarding.family_version,hs_onboarding.family_flows
  FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
COMMIT;
