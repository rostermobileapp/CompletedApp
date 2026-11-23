-- EXPLICIT, ADDITIVE, ISOLATED DEV INSTALL ONLY. Not a production migration.
BEGIN;
CREATE TABLE IF NOT EXISTS hs_onboarding.youth_version(
  version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.youth_version VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE hs_onboarding.flows DROP CONSTRAINT IF EXISTS flows_path_check;
ALTER TABLE hs_onboarding.flows ADD CONSTRAINT flows_path_check
  CHECK(path IN('player','organizer','staff','parent','league_admin'));
CREATE TABLE IF NOT EXISTS hs_onboarding.contexts(
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hockey_type text NOT NULL CHECK(hockey_type IN('adult','high_school_youth')),
  journey jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hs_onboarding.league_drafts(
  auth_id uuid PRIMARY KEY REFERENCES hs_onboarding.flows(auth_id),
  draft jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
-- Child registry is deliberately operator-controlled. There is no activation API.
-- Consent, membership, coverage and independent Auth safety must be proven first.
CREATE TABLE IF NOT EXISTS hs_onboarding.children(
  id uuid PRIMARY KEY,
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  player_request_id uuid NOT NULL UNIQUE REFERENCES hs_onboarding.player_requests(id),
  first_name text NOT NULL,last_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hs_onboarding.device_codes(
  id uuid PRIMARY KEY, child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  code_digest text UNIQUE NOT NULL, failures integer NOT NULL DEFAULT 0 CHECK(failures BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS hs_device_code_child ON hs_onboarding.device_codes(child_id,created_at);
CREATE TABLE IF NOT EXISTS hs_onboarding.device_requests(
  id uuid PRIMARY KEY, code_id uuid NOT NULL UNIQUE REFERENCES hs_onboarding.device_codes(id),
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  token_digest text NOT NULL UNIQUE, device_label text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK(status IN('waiting','approved','denied','redeemed')),
  approved_session_id uuid, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hs_onboarding.child_sessions(
  token_digest text PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  request_id uuid NOT NULL UNIQUE REFERENCES hs_onboarding.device_requests(id),
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  approved_session_id uuid NOT NULL,expires_at timestamptz NOT NULL,
  revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hs_onboarding.device_attempts(
  source_digest text PRIMARY KEY,failures integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now());
-- Child surfaces are separate from all legacy adult messaging/storage streams.
CREATE TABLE IF NOT EXISTS hs_onboarding.child_events(
  id uuid PRIMARY KEY,child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  title text NOT NULL,starts_at text NOT NULL,location text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS hs_onboarding.child_chats(
  id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('team','family')),
  name text NOT NULL,parent_auth_id uuid REFERENCES hs_parent_security.accounts(auth_id),
  team_id uuid REFERENCES hs_onboarding.teams(id),
  CHECK((kind='family' AND parent_auth_id IS NOT NULL AND team_id IS NULL)
    OR(kind='team' AND team_id IS NOT NULL AND parent_auth_id IS NULL)));
CREATE TABLE IF NOT EXISTS hs_onboarding.child_chat_members(
  chat_id uuid REFERENCES hs_onboarding.child_chats(id),
  child_id uuid REFERENCES hs_onboarding.children(id),
  PRIMARY KEY(chat_id,child_id));
CREATE TABLE IF NOT EXISTS hs_onboarding.child_messages(
  id uuid PRIMARY KEY,chat_id uuid NOT NULL REFERENCES hs_onboarding.child_chats(id),
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='hs_onboarding' LOOP
    EXECUTE format('ALTER TABLE hs_onboarding.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
COMMIT;
