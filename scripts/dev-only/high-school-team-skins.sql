-- Explicit isolated-DEV installer only. Never a startup/publish migration.
BEGIN;
DO $$ BEGIN
  IF current_setting('roster.hs_skin_dev',true) IS DISTINCT FROM 'phase1' THEN
    RAISE EXCEPTION 'Explicit isolated DEV connection required';
  END IF;
END $$;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS program_type text NOT NULL DEFAULT 'adult'
  CHECK(program_type IN('adult','high_school'));
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES hs_onboarding.programs(id);
ALTER TABLE public.team_memberships ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player'
  CHECK(role IN('player','parent','head_coach','assistant_coach','team_manager','athletic_director'));
-- Child actors are not Auth users. Never create a login or reuse the parent as
-- a player: exactly one of user_id / child_profile_id identifies membership.
ALTER TABLE public.team_memberships ADD COLUMN IF NOT EXISTS child_profile_id uuid REFERENCES hs_onboarding.children(id);
ALTER TABLE public.team_memberships ALTER COLUMN user_id DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='hs_skin_membership_actor'
    AND conrelid='public.team_memberships'::regclass) THEN
    ALTER TABLE public.team_memberships ADD CONSTRAINT hs_skin_membership_actor
      CHECK((user_id IS NOT NULL)::int+(child_profile_id IS NOT NULL)::int=1);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS hs_onboarding.skin_version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO hs_onboarding.skin_version VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS hs_onboarding.skin_migration_memberships(
  membership_id varchar PRIMARY KEY, source_key text NOT NULL);
ALTER TABLE hs_onboarding.skin_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_onboarding.skin_migration_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_onboarding.skin_version,hs_onboarding.skin_migration_memberships
  FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;

-- Materialize only approved synthetic source records. No Auth/account role,
-- consent, parent verification, billing or child activation state is changed.
CREATE TEMP TABLE skin_sources ON COMMIT DROP AS
WITH fixture AS (
  SELECT id,email FROM auth.users WHERE email_confirmed_at IS NOT NULL
    AND lower(email) LIKE '%@example.com'
    AND raw_app_meta_data->>'synthetic_high_school_onboarding_dev'='true'
), eligible_players AS (
  SELECT r.* FROM hs_onboarding.player_requests r JOIN fixture f ON f.id=r.auth_id
  JOIN hs_onboarding.teams t ON t.id=r.team_id JOIN hs_onboarding.programs p ON p.id=t.program_id
  WHERE r.status='approved' AND p.status='approved'
    AND r.consent_version='dev-draft-2026-11-19' AND r.consented_at IS NOT NULL
    AND (SELECT count(DISTINCT player_key) FROM hs_onboarding.player_requests
      WHERE auth_id=r.auth_id AND status='approved')<=2
), candidates AS (
  SELECT s.auth_id::text AS user_id,NULL::uuid AS child_profile_id,t.id AS team_id,
    s.role,'staff:'||s.id::text AS source_key
  FROM hs_onboarding.staff_requests s JOIN fixture f ON f.id=s.auth_id
  JOIN hs_onboarding.programs p ON p.id=s.program_id AND p.status='approved'
  JOIN hs_onboarding.teams t ON t.program_id=p.id
    AND(s.role='athletic_director' OR t.id=s.team_id)
  WHERE s.status='approved'
  UNION ALL
  SELECT r.auth_id::text,NULL::uuid,r.team_id,'parent','parent:'||r.auth_id::text FROM eligible_players r
  UNION ALL
  SELECT NULL::text,c.id,r.team_id,'player','child:'||c.id::text FROM eligible_players r
    JOIN hs_onboarding.children c ON c.player_request_id=r.id AND c.parent_auth_id=r.auth_id
    WHERE c.revoked_at IS NULL
)
SELECT DISTINCT ON(coalesce('user:'||user_id,'child:'||child_profile_id::text),team_id) *
FROM candidates
ORDER BY coalesce('user:'||user_id,'child:'||child_profile_id::text),team_id,
  CASE role WHEN 'athletic_director' THEN 0 WHEN 'head_coach' THEN 1
    WHEN 'assistant_coach' THEN 2 WHEN 'team_manager' THEN 3 WHEN 'parent' THEN 4 ELSE 5 END;

-- Refuse an ID collision instead of converting an adult team to HS.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM skin_sources s JOIN public.teams t ON t.id=s.team_id::text
    WHERE t.program_type<>'high_school') THEN RAISE EXCEPTION 'Team identity collision'; END IF;
END $$;
INSERT INTO public.users(id,email,first_name,last_name)
SELECT a.id::text,a.email,a.raw_user_meta_data->>'first_name',a.raw_user_meta_data->>'last_name'
FROM auth.users a WHERE a.id::text IN(SELECT user_id FROM skin_sources WHERE user_id IS NOT NULL)
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.teams(id,name,program_type,program_id)
SELECT DISTINCT t.id::text,t.name,'high_school',t.program_id
FROM hs_onboarding.teams t JOIN skin_sources s ON s.team_id=t.id
ON CONFLICT(id) DO UPDATE SET name=excluded.name,program_id=excluded.program_id;
-- Re-running an explicitly approved migration revokes no-longer-eligible
-- migrated rows, but never touches unrelated preexisting memberships.
UPDATE public.team_memberships SET status='pending'
WHERE id IN(SELECT membership_id FROM hs_onboarding.skin_migration_memberships);
INSERT INTO public.team_memberships(id,user_id,child_profile_id,team_id,role,status,is_captain)
SELECT md5('hs-skin:'||coalesce('user:'||user_id,'child:'||child_profile_id::text)||':'||team_id::text)::uuid::text,
  user_id,child_profile_id,team_id::text,role,'approved',false FROM skin_sources
ON CONFLICT(id) DO UPDATE SET role=excluded.role,status=excluded.status;
INSERT INTO hs_onboarding.skin_migration_memberships(membership_id,source_key)
SELECT md5('hs-skin:'||coalesce('user:'||user_id,'child:'||child_profile_id::text)||':'||team_id::text)::uuid::text,source_key FROM skin_sources
ON CONFLICT(membership_id) DO UPDATE SET source_key=excluded.source_key;
COMMIT;
