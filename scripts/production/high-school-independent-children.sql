-- Separate additive migration. Never edit/reinstall an installed manifest.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(882417,23);
DO $$ BEGIN
  IF current_setting('roster.independent_children',true) IS DISTINCT FROM 'owner-authorized' THEN
    RAISE EXCEPTION 'Explicit production child-profile authorization required';
  END IF;
  IF to_regclass('hs_onboarding.production_test_version') IS NULL
    OR to_regclass('hs_onboarding.family_version') IS NULL
    OR to_regclass('hs_parent_security.live_version') IS NULL THEN
    RAISE EXCEPTION 'Protected restricted-test foundation required';
  END IF;
  IF to_regclass('hs_onboarding.independent_child_version') IS NOT NULL THEN
    RAISE EXCEPTION 'Existing child-profile migration requires reconciliation';
  END IF;
END $$;
ALTER TABLE hs_onboarding.children ALTER COLUMN player_request_id DROP NOT NULL;
ALTER TABLE hs_onboarding.children ADD COLUMN profile_details jsonb;
ALTER TABLE hs_onboarding.children ADD COLUMN profile_consent_version text;
ALTER TABLE hs_onboarding.children ADD COLUMN profile_consented_at timestamptz;
ALTER TABLE hs_onboarding.children ADD CONSTRAINT independent_child_consent_required CHECK(
  player_request_id IS NOT NULL OR
  (profile_details IS NOT NULL AND profile_consent_version IS NOT NULL AND profile_consented_at IS NOT NULL
    AND profile_details->>'consent'='true' AND profile_details->>'consentVersion'=profile_consent_version
    AND profile_details->>'firstName'=first_name AND profile_details->>'lastName'=last_name
    AND jsonb_typeof(profile_details->'birthYear')='number'
    AND (profile_details->>'birthYear')::integer BETWEEN 1900 AND 2200) IS TRUE);
CREATE UNIQUE INDEX independent_child_household_key ON hs_onboarding.children(parent_auth_id,(profile_details->>'id'))
  WHERE profile_details IS NOT NULL;
CREATE TABLE hs_onboarding.independent_child_version(
  version integer PRIMARY KEY CHECK(version=1),manifest text NOT NULL);
ALTER TABLE hs_onboarding.independent_child_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_onboarding.independent_child_version
  FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
-- CHILD_PROFILE_MANIFEST
-- Installer validates original protections before committing.
