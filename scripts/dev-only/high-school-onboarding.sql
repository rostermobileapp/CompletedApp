-- Explicit isolated DEV install only. Never add to production migrations.
BEGIN;
CREATE SCHEMA hs_onboarding;
REVOKE ALL ON SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
CREATE TABLE hs_onboarding.version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.version VALUES(1);
CREATE TABLE hs_onboarding.leagues(id uuid PRIMARY KEY,name text NOT NULL);
CREATE TABLE hs_onboarding.league_approvers(
  league_id uuid REFERENCES hs_onboarding.leagues(id),auth_id uuid NOT NULL,
  PRIMARY KEY(league_id,auth_id));
CREATE TABLE hs_onboarding.programs(
  id uuid PRIMARY KEY,league_id uuid NOT NULL REFERENCES hs_onboarding.leagues(id),
  name text NOT NULL,town text NOT NULL,status text NOT NULL CHECK(status IN('pending','approved')),
  requested_by uuid NOT NULL,approved_by uuid,
  UNIQUE(league_id,name,town));
CREATE TABLE hs_onboarding.teams(
  id uuid PRIMARY KEY,program_id uuid NOT NULL REFERENCES hs_onboarding.programs(id),
  name text NOT NULL,code_digest text UNIQUE NOT NULL);
CREATE TABLE hs_onboarding.flows(
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  path text NOT NULL CHECK(path IN('player','organizer','staff','parent')),
  block_legacy boolean NOT NULL,revision integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',draft jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.staff_requests(
  id uuid PRIMARY KEY,auth_id uuid NOT NULL REFERENCES hs_onboarding.flows(auth_id),
  program_id uuid NOT NULL REFERENCES hs_onboarding.programs(id),
  team_id uuid REFERENCES hs_onboarding.teams(id),
  role text NOT NULL CHECK(role IN('head_coach','assistant_coach','athletic_director','team_manager')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','denied')),
  decided_by uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX staff_request_unique ON hs_onboarding.staff_requests(auth_id,program_id,coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid),role);
CREATE TABLE hs_onboarding.staged_players(
  id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  source_key text NOT NULL,first_name text NOT NULL,last_name text NOT NULL,
  grad_year integer NOT NULL,position text NOT NULL,jersey_number text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  UNIQUE(team_id,source_key));
CREATE TABLE hs_onboarding.invitations(
  token_digest text PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  kind text NOT NULL CHECK(kind IN('parent','staff')),recipient_email text NOT NULL,
  staff_role text,staged_ids uuid[] NOT NULL DEFAULT '{}',created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days');
CREATE TABLE hs_onboarding.player_requests(
  id uuid PRIMARY KEY,auth_id uuid NOT NULL REFERENCES hs_onboarding.flows(auth_id),
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),staged_id uuid UNIQUE REFERENCES hs_onboarding.staged_players(id),
  player_key uuid NOT NULL,details jsonb NOT NULL,consent_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'pending_staff',
  UNIQUE(auth_id,player_key));
CREATE TABLE hs_onboarding.audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,auth_id uuid NOT NULL,event text NOT NULL,
  target_id uuid,created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='hs_onboarding' LOOP
    EXECUTE format('ALTER TABLE hs_onboarding.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
COMMIT;
