-- Additive external production rollout, explicitly authorized for selected accounts.
-- No DEV installers, account resets, fixture seeds or automatic role grants.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(882417,22);
DO $$ BEGIN
  IF current_setting('roster.onboarding_tests',true) IS DISTINCT FROM 'owner-authorized' THEN
    RAISE EXCEPTION 'Explicit production test authorization required';
  END IF;
  IF to_regclass('hs_parent_security.live_version') IS NULL
    OR to_regclass('hs_onboarding.family_version') IS NULL THEN
    RAISE EXCEPTION 'Protected production Family foundation required';
  END IF;
  IF to_regclass('hs_onboarding.production_test_version') IS NOT NULL
    OR to_regclass('hs_onboarding.flows') IS NOT NULL THEN
    RAISE EXCEPTION 'Existing test installation requires version reconciliation';
  END IF;
END $$;
CREATE TABLE hs_onboarding.production_test_version(
  version integer PRIMARY KEY CHECK(version=1), manifest text NOT NULL, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE hs_onboarding.league_approvers(
  league_id uuid REFERENCES hs_onboarding.leagues(id),auth_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY(league_id,auth_id));
CREATE TABLE hs_onboarding.flows(
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL CHECK(path IN('player','organizer','staff','parent','league_admin')),
  block_legacy boolean NOT NULL DEFAULT false CHECK(NOT block_legacy),
  revision integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'draft',
  draft jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.contexts(
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hockey_type text NOT NULL CHECK(hockey_type IN('adult','high_school_youth')),
  journey jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.league_drafts(
  auth_id uuid PRIMARY KEY REFERENCES hs_onboarding.flows(auth_id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.staff_requests(
  id uuid PRIMARY KEY,auth_id uuid NOT NULL REFERENCES hs_onboarding.flows(auth_id),
  program_id uuid NOT NULL REFERENCES hs_onboarding.programs(id),team_id uuid REFERENCES hs_onboarding.teams(id),
  role text NOT NULL CHECK(role IN('head_coach','assistant_coach','athletic_director','team_manager')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','denied')),
  decided_by uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX staff_request_unique ON hs_onboarding.staff_requests
  (auth_id,program_id,coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid),role);
CREATE TABLE hs_onboarding.youth_version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.youth_version VALUES(1);
CREATE TABLE hs_onboarding.skin_version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.skin_version VALUES(1);
CREATE TABLE hs_onboarding.skin_migration_memberships(
  membership_id varchar PRIMARY KEY,source_key text NOT NULL);
CREATE TABLE hs_onboarding.team_settings(
  team_id uuid PRIMARY KEY REFERENCES hs_onboarding.teams(id),rink text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '');
CREATE TABLE hs_onboarding.staff_events(
  id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  title text NOT NULL,opponent text NOT NULL DEFAULT '',starts_at timestamptz NOT NULL,
  rink text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','final')),
  home_score integer CHECK(home_score BETWEEN 0 AND 99),away_score integer CHECK(away_score BETWEEN 0 AND 99),
  deleted_at timestamptz,reported_by uuid REFERENCES auth.users(id),
  CHECK((status='scheduled' AND home_score IS NULL AND away_score IS NULL)
    OR(status='final' AND home_score IS NOT NULL AND away_score IS NOT NULL)));
CREATE INDEX hs_staff_events_team ON hs_onboarding.staff_events(team_id,starts_at);
CREATE TABLE hs_onboarding.staff_lineup(
  event_id uuid REFERENCES hs_onboarding.staff_events(id),child_id uuid REFERENCES hs_onboarding.children(id),
  state text NOT NULL CHECK(state IN('dress','scratch')),updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY(event_id,child_id));
CREATE TABLE hs_onboarding.staff_dispatch(
  id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES hs_onboarding.staff_events(id),
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),event_version integer NOT NULL,
  action text NOT NULL CHECK(action IN('created','updated','deleted')),
  delivered_at timestamptz,attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,event_version));
CREATE TABLE hs_onboarding.staff_invitations(
  id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  recipient_email text NOT NULL,role text NOT NULL CHECK(role IN('assistant_coach','team_manager')),
  created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
  delivery text NOT NULL DEFAULT 'disabled' CHECK(delivery='disabled'),UNIQUE(team_id,recipient_email,role));
CREATE TABLE hs_onboarding.staff_payment_links(
  request_id varchar PRIMARY KEY REFERENCES public.payment_requests(id),
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id));
CREATE TABLE hs_onboarding.device_codes(
  id uuid PRIMARY KEY,child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  code_digest text UNIQUE NOT NULL,failures integer NOT NULL DEFAULT 0 CHECK(failures BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX hs_device_code_child ON hs_onboarding.device_codes(child_id,created_at);
CREATE TABLE hs_onboarding.device_requests(
  id uuid PRIMARY KEY,code_id uuid NOT NULL UNIQUE REFERENCES hs_onboarding.device_codes(id),
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  token_digest text NOT NULL UNIQUE,device_label text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK(status IN('waiting','approved','denied','redeemed')),
  approved_session_id uuid,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.child_sessions(
  token_digest text PRIMARY KEY,child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  request_id uuid NOT NULL UNIQUE REFERENCES hs_onboarding.device_requests(id),
  parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id),
  approved_session_id uuid NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.device_attempts(
  source_digest text PRIMARY KEY,failures integer NOT NULL DEFAULT 0,window_started_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.child_events(
  id uuid PRIMARY KEY,child_id uuid NOT NULL REFERENCES hs_onboarding.children(id),
  title text NOT NULL,starts_at text NOT NULL,location text NOT NULL DEFAULT '');
CREATE TABLE hs_onboarding.child_chats(
  id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('team','family','parents','coaches')),
  name text NOT NULL,parent_auth_id uuid REFERENCES hs_parent_security.accounts(auth_id),
  team_id uuid REFERENCES hs_onboarding.teams(id),
  CHECK((kind='family' AND parent_auth_id IS NOT NULL AND team_id IS NULL)
    OR(kind IN('team','parents','coaches') AND team_id IS NOT NULL AND parent_auth_id IS NULL)));
CREATE UNIQUE INDEX hs_chat_team_kind ON hs_onboarding.child_chats(team_id,kind) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX hs_chat_family ON hs_onboarding.child_chats(parent_auth_id) WHERE kind='family';
CREATE TABLE hs_onboarding.child_chat_members(
  chat_id uuid REFERENCES hs_onboarding.child_chats(id),child_id uuid REFERENCES hs_onboarding.children(id),
  PRIMARY KEY(chat_id,child_id));
CREATE TABLE hs_onboarding.child_messages(
  id uuid PRIMARY KEY,chat_id uuid NOT NULL REFERENCES hs_onboarding.child_chats(id),
  child_id uuid REFERENCES hs_onboarding.children(id),author_auth_id uuid REFERENCES auth.users(id),request_id uuid,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((child_id IS NOT NULL)::int+(author_auth_id IS NOT NULL)::int=1));
CREATE UNIQUE INDEX hs_message_retry ON hs_onboarding.child_messages(author_auth_id,request_id)
  WHERE author_auth_id IS NOT NULL AND request_id IS NOT NULL;
CREATE TABLE hs_onboarding.message_reports(
  id uuid PRIMARY KEY,message_id uuid NOT NULL REFERENCES hs_onboarding.child_messages(id),
  reported_by uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
  resolved_by uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(message_id,reported_by));
-- No changes to Auth guards, account records, adult teams or memberships.
-- Replace the blanket child-disable check with a selected-parent-only boundary.
CREATE FUNCTION hs_onboarding.production_child_parent_allowed(parent_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT EXISTS(SELECT 1 FROM public.users u JOIN hs_parent_security.accounts p ON p.auth_id::text=u.id
    WHERE p.auth_id=parent_id AND p.activated_at IS NOT NULL AND u.deleted_at IS NULL
      AND u.display_id IN('U00001','U00002','U00250'))
    AND EXISTS(SELECT 1 FROM hs_onboarding.production_test_version WHERE version=1 AND enabled)
$fn$;
REVOKE ALL ON FUNCTION hs_onboarding.production_child_parent_allowed(uuid)
  FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
ALTER TABLE hs_onboarding.children DROP CONSTRAINT children_enabled_check;
ALTER TABLE hs_onboarding.children ADD CONSTRAINT children_enabled_test_parent
  CHECK(NOT enabled OR hs_onboarding.production_child_parent_allowed(parent_auth_id));
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='hs_onboarding' LOOP
    EXECUTE format('ALTER TABLE hs_onboarding.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
-- TEST_MANIFEST
-- Caller checks the original Family protection and commits; any error rolls back.
