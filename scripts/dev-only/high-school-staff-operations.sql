-- Explicit isolated DEV installation; never startup, deployment or production SQL.
BEGIN;
DO $$ BEGIN
  IF current_setting('roster.hs_staff_dev',true) IS DISTINCT FROM 'phase2' THEN
    RAISE EXCEPTION 'Explicit isolated DEV connection required';
  END IF;
  IF to_regclass('hs_onboarding.skin_version') IS NULL THEN
    RAISE EXCEPTION 'Install the canonical skin foundation first';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS hs_onboarding.staff_version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.staff_version VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS hs_onboarding.team_settings(
  team_id uuid PRIMARY KEY REFERENCES hs_onboarding.teams(id),
  rink text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS hs_onboarding.staff_events(
  id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  title text NOT NULL,opponent text NOT NULL DEFAULT '',starts_at timestamptz NOT NULL,
  rink text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','final')),
  home_score integer CHECK(home_score BETWEEN 0 AND 99),away_score integer CHECK(away_score BETWEEN 0 AND 99),
  deleted_at timestamptz,reported_by uuid REFERENCES auth.users(id),
  CHECK((status='scheduled' AND home_score IS NULL AND away_score IS NULL)
    OR(status='final' AND home_score IS NOT NULL AND away_score IS NOT NULL)));
CREATE INDEX IF NOT EXISTS hs_staff_events_team ON hs_onboarding.staff_events(team_id,starts_at);
CREATE TABLE IF NOT EXISTS hs_onboarding.staff_lineup(
  event_id uuid REFERENCES hs_onboarding.staff_events(id),child_id uuid REFERENCES hs_onboarding.children(id),
  state text NOT NULL CHECK(state IN('dress','scratch')),updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY(event_id,child_id));
CREATE TABLE IF NOT EXISTS hs_onboarding.staff_dispatch(
  id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES hs_onboarding.staff_events(id),
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),event_version integer NOT NULL,
  action text NOT NULL CHECK(action IN('created','updated','deleted')),
  delivered_at timestamptz,attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,event_version));
CREATE TABLE IF NOT EXISTS hs_onboarding.staff_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,program_id uuid NOT NULL REFERENCES hs_onboarding.programs(id),
  team_id uuid REFERENCES hs_onboarding.teams(id),auth_id uuid NOT NULL REFERENCES auth.users(id),
  event text NOT NULL,target_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS hs_staff_audit_program ON hs_onboarding.staff_audit(program_id,created_at);
CREATE TABLE IF NOT EXISTS hs_onboarding.staff_invitations(
  id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  recipient_email text NOT NULL CHECK(recipient_email LIKE '%@example.com'),
  role text NOT NULL CHECK(role IN('assistant_coach','team_manager')),
  created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
  delivery text NOT NULL DEFAULT 'disabled' CHECK(delivery='disabled'),
  UNIQUE(team_id,recipient_email,role));
CREATE TABLE IF NOT EXISTS hs_onboarding.staff_payment_links(
  request_id varchar PRIMARY KEY REFERENCES public.payment_requests(id),
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id));
-- Extend the existing Team thread instead of inventing a second child thread.
ALTER TABLE hs_onboarding.child_chats DROP CONSTRAINT IF EXISTS child_chats_kind_check;
ALTER TABLE hs_onboarding.child_chats DROP CONSTRAINT IF EXISTS child_chats_check;
ALTER TABLE hs_onboarding.child_chats ADD CONSTRAINT child_chats_kind_check CHECK(kind IN('team','family','parents','coaches'));
ALTER TABLE hs_onboarding.child_chats ADD CONSTRAINT child_chats_check CHECK(
  (kind='family' AND parent_auth_id IS NOT NULL AND team_id IS NULL)
  OR(kind IN('team','parents','coaches') AND team_id IS NOT NULL AND parent_auth_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS hs_chat_team_kind ON hs_onboarding.child_chats(team_id,kind) WHERE team_id IS NOT NULL;
ALTER TABLE hs_onboarding.child_messages ALTER COLUMN child_id DROP NOT NULL;
ALTER TABLE hs_onboarding.child_messages ADD COLUMN IF NOT EXISTS author_auth_id uuid REFERENCES auth.users(id);
ALTER TABLE hs_onboarding.child_messages ADD COLUMN IF NOT EXISTS request_id uuid;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='hs_message_one_author') THEN
    ALTER TABLE hs_onboarding.child_messages ADD CONSTRAINT hs_message_one_author
      CHECK((child_id IS NOT NULL)::int+(author_auth_id IS NOT NULL)::int=1);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS hs_message_retry ON hs_onboarding.child_messages(author_auth_id,request_id)
  WHERE author_auth_id IS NOT NULL AND request_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS hs_onboarding.message_reports(
  id uuid PRIMARY KEY,message_id uuid NOT NULL REFERENCES hs_onboarding.child_messages(id),
  reported_by uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
  resolved_by uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id,reported_by));
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='hs_onboarding' LOOP
    EXECUTE format('ALTER TABLE hs_onboarding.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
COMMIT;
