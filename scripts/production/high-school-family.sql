-- Explicit, owner-authorized external Supabase installation. Never startup
-- SQL, a DEV installer, a fixture seed, or an automatic Publish migration.
-- The installer supplies the account-guard definitions in this transaction.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(882417,21);
DO $$ BEGIN
  IF current_setting('roster.family_production',true) IS DISTINCT FROM 'approved-rollout' THEN
    RAISE EXCEPTION 'Explicit authorized family installation required';
  END IF;
  IF to_regnamespace('hs_parent_security') IS NOT NULL OR to_regnamespace('hs_onboarding') IS NOT NULL THEN
    RAISE EXCEPTION 'Existing family schema requires explicit version reconciliation';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole,
    unnest(s.setconfig) c WHERE r.rolname='authenticator'
    AND s.setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
    AND c LIKE 'pgrst.db_pre_request=%'
    AND c<>'pgrst.db_pre_request=') THEN
    RAISE EXCEPTION 'Preserve and review the existing API pre-request hook before installing';
  END IF;
END $$;
CREATE SCHEMA hs_parent_security;
REVOKE ALL ON SCHEMA hs_parent_security FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
CREATE TABLE hs_parent_security.version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_parent_security.version VALUES(1);
CREATE TABLE hs_parent_security.accounts(
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_email text NOT NULL,enrolled_at timestamptz NOT NULL DEFAULT now(),activated_at timestamptz);
CREATE TABLE hs_parent_security.challenges(
  id uuid PRIMARY KEY,auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id) ON DELETE CASCADE,
  session_id uuid NOT NULL,purpose text NOT NULL CHECK(purpose IN('parent_action','password_change')),
  code_digest text NOT NULL,attempts integer NOT NULL DEFAULT 0,delivered boolean NOT NULL DEFAULT false,
  consumed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL);
CREATE INDEX ON hs_parent_security.challenges(auth_id,created_at);
CREATE TABLE hs_parent_security.grants(
  token_digest text PRIMARY KEY,auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id) ON DELETE CASCADE,
  session_id uuid NOT NULL,purpose text NOT NULL CHECK(purpose IN('parent_action','password_change')),
  expires_at timestamptz NOT NULL,consumed boolean NOT NULL DEFAULT false);
CREATE INDEX ON hs_parent_security.grants(auth_id,session_id);
CREATE TABLE hs_parent_security.writes(
  transaction_id bigint NOT NULL,auth_id uuid NOT NULL,password_hash text NOT NULL,PRIMARY KEY(transaction_id,auth_id));
CREATE TABLE hs_parent_security.audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,auth_id uuid NOT NULL,session_id uuid,
  event text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

CREATE SCHEMA hs_onboarding;
REVOKE ALL ON SCHEMA hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
CREATE TABLE hs_onboarding.version(version integer PRIMARY KEY CHECK(version=1));
CREATE TABLE hs_onboarding.family_version(version integer PRIMARY KEY CHECK(version=1));
CREATE TABLE hs_onboarding.staff_version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.version VALUES(1);
INSERT INTO hs_onboarding.family_version VALUES(1);
INSERT INTO hs_onboarding.staff_version VALUES(1);
CREATE TABLE hs_onboarding.leagues(id uuid PRIMARY KEY,name text NOT NULL);
CREATE TABLE hs_onboarding.programs(
  id uuid PRIMARY KEY,league_id uuid NOT NULL REFERENCES hs_onboarding.leagues(id),name text NOT NULL,town text NOT NULL,
  status text NOT NULL CHECK(status IN('pending','approved')),requested_by uuid NOT NULL,approved_by uuid,
  UNIQUE(league_id,name,town));
CREATE TABLE hs_onboarding.teams(
  id uuid PRIMARY KEY,program_id uuid NOT NULL REFERENCES hs_onboarding.programs(id),name text NOT NULL,code_digest text UNIQUE NOT NULL);
CREATE TABLE hs_onboarding.staged_players(
  id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),source_key text NOT NULL,
  first_name text NOT NULL,last_name text NOT NULL,grad_year integer NOT NULL,position text NOT NULL,
  jersey_number text NOT NULL DEFAULT '',expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',UNIQUE(team_id,source_key));
CREATE TABLE hs_onboarding.invitations(
  token_digest text PRIMARY KEY,team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  kind text NOT NULL CHECK(kind IN('parent','staff')),recipient_email text NOT NULL,staff_role text,
  staged_ids uuid[] NOT NULL DEFAULT '{}',created_by uuid NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days');
CREATE TABLE hs_onboarding.family_flows(
  auth_id uuid PRIMARY KEY REFERENCES hs_parent_security.accounts(auth_id) ON DELETE CASCADE,
  adult_user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  path text NOT NULL DEFAULT 'parent' CHECK(path='parent'),block_legacy boolean NOT NULL DEFAULT false CHECK(NOT block_legacy),
  revision integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'draft',draft jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.player_requests(
  id uuid PRIMARY KEY,auth_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),staged_id uuid UNIQUE REFERENCES hs_onboarding.staged_players(id),
  player_key uuid NOT NULL,details jsonb NOT NULL,consent_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'pending_staff',
  decided_by uuid,decided_at timestamptz,UNIQUE(auth_id,player_key));
CREATE TABLE hs_onboarding.children(
  id uuid PRIMARY KEY,parent_auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id) ON DELETE CASCADE,
  player_request_id uuid UNIQUE NOT NULL REFERENCES hs_onboarding.player_requests(id) ON DELETE CASCADE,
  first_name text NOT NULL,last_name text NOT NULL,enabled boolean NOT NULL DEFAULT false CHECK(NOT enabled),revoked_at timestamptz);
CREATE TABLE hs_onboarding.audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,auth_id uuid NOT NULL,event text NOT NULL,target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hs_onboarding.staff_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,program_id uuid NOT NULL,team_id uuid,
  auth_id uuid NOT NULL,event text NOT NULL,target_id uuid,created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE public.teams ADD COLUMN program_type text NOT NULL DEFAULT 'adult' CHECK(program_type IN('adult','high_school'));
ALTER TABLE public.teams ADD COLUMN program_id uuid REFERENCES hs_onboarding.programs(id);
ALTER TABLE public.team_memberships ADD COLUMN role text NOT NULL DEFAULT 'player'
  CHECK(role IN('player','parent','head_coach','assistant_coach','team_manager','athletic_director'));
ALTER TABLE public.team_memberships ADD COLUMN child_profile_id uuid REFERENCES hs_onboarding.children(id) ON DELETE CASCADE;
ALTER TABLE public.team_memberships ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.team_memberships ADD CONSTRAINT family_membership_actor
  CHECK((user_id IS NOT NULL)::int+(child_profile_id IS NOT NULL)::int=1
    AND(child_profile_id IS NULL OR role='player'));

-- App features use the authenticated backend, not direct Supabase table/RPC
-- or Storage access. Direct-family requests are deliberately denied rather
-- than treating possession of the shared Auth JWT as parent authority.
CREATE FUNCTION public.roster_family_direct_access_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT NOT EXISTS(SELECT 1 FROM hs_parent_security.accounts
    WHERE auth_id=auth.uid() AND activated_at IS NOT NULL)
$fn$;
REVOKE ALL ON FUNCTION public.roster_family_direct_access_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_family_direct_access_allowed() TO anon,authenticated,service_role;
CREATE FUNCTION public.roster_family_api_guard() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NOT public.roster_family_direct_access_allowed() THEN
    RAISE EXCEPTION 'Use the protected application API' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.set_config('response.headers',
    (coalesce(nullif(pg_catalog.current_setting('response.headers',true),''),'[]')::jsonb
      || '[{"X-Roster-Family-Guard":"1"}]'::jsonb)::text,true);
END $fn$;
REVOKE ALL ON FUNCTION public.roster_family_api_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_family_api_guard() TO anon,authenticated,service_role;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p') LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=format('public.%I',t.relname)::regclass) THEN
      RAISE EXCEPTION 'Review the existing non-RLS table before installing';
    END IF;
    EXECUTE format('CREATE POLICY roster_family_direct_guard ON public.%I AS RESTRICTIVE TO authenticated USING((SELECT public.roster_family_direct_access_allowed())) WITH CHECK((SELECT public.roster_family_direct_access_allowed()))',t.relname);
  END LOOP;
  EXECUTE format('ALTER ROLE authenticator IN DATABASE %I SET pgrst.db_pre_request=%L',current_database(),'public.roster_family_api_guard');
END $$;
CREATE POLICY roster_family_child_privacy ON public.team_memberships AS RESTRICTIVE TO anon,authenticated
  USING(child_profile_id IS NULL AND role='player') WITH CHECK(child_profile_id IS NULL AND role='player');
CREATE POLICY roster_family_storage_guard ON storage.objects AS RESTRICTIVE TO authenticated
  USING((SELECT public.roster_family_direct_access_allowed())) WITH CHECK((SELECT public.roster_family_direct_access_allowed()));

DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('hs_parent_security','hs_onboarding') LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',t.schemaname,t.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hs_parent_security,hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hs_parent_security,hs_onboarding FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA hs_parent_security,hs_onboarding REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- ACCOUNT_GUARDS
CREATE TRIGGER hs_parent_security_user BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION hs_parent_security.guard_user();
CREATE TRIGGER hs_parent_security_delete BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION hs_parent_security.guard_delete_user();
CREATE TRIGGER hs_parent_security_identity BEFORE INSERT OR UPDATE OR DELETE ON auth.identities FOR EACH ROW EXECUTE FUNCTION hs_parent_security.guard_factor_or_identity();
CREATE TRIGGER hs_parent_security_mfa BEFORE INSERT OR UPDATE OR DELETE ON auth.mfa_factors FOR EACH ROW EXECUTE FUNCTION hs_parent_security.guard_factor_or_identity();
CREATE TABLE hs_parent_security.live_version(version integer PRIMARY KEY CHECK(version=1),manifest text NOT NULL);
ALTER TABLE hs_parent_security.live_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_parent_security.live_version FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
-- LIVE_MANIFEST
NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';
-- Caller verifies readiness and commits, or rolls the complete installation back.
