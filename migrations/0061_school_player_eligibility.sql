-- Explicit owner-approved external Supabase installation only. Never startup DDL.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS hs_onboarding.league_player_eligibility (
  league_id uuid NOT NULL REFERENCES hs_onboarding.leagues(id),
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id) ON DELETE CASCADE,
  restricted boolean NOT NULL,
  reason text NOT NULL CHECK(length(reason)<=500 AND (NOT restricted OR length(trim(reason))>0)),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(league_id,child_id)
);
CREATE TABLE IF NOT EXISTS hs_onboarding.team_player_eligibility (
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id) ON DELETE CASCADE,
  restricted boolean NOT NULL,
  reason text NOT NULL CHECK(length(reason)<=500 AND (NOT restricted OR length(trim(reason))>0)),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(team_id,child_id)
);
CREATE TABLE IF NOT EXISTS hs_onboarding.player_eligibility_audit (
  id uuid PRIMARY KEY,
  league_id uuid NOT NULL REFERENCES hs_onboarding.leagues(id),
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  child_id uuid NOT NULL REFERENCES hs_onboarding.children(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK(scope IN('league','team')),
  restricted boolean NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hs_onboarding.league_player_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_onboarding.team_player_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_onboarding.player_eligibility_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_onboarding.league_player_eligibility, hs_onboarding.team_player_eligibility,
  hs_onboarding.player_eligibility_audit FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
COMMIT;
