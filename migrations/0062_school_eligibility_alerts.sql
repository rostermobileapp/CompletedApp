-- Explicit approved installation only; never run DDL at application startup.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS hs_onboarding.eligibility_alerts (
  id uuid PRIMARY KEY,
  audit_id uuid NOT NULL REFERENCES hs_onboarding.player_eligibility_audit(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES hs_onboarding.teams(id),
  recipient_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  push_delivered_at timestamptz,
  cancelled_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  UNIQUE(audit_id,team_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS eligibility_alerts_pending
  ON hs_onboarding.eligibility_alerts(recipient_id,team_id,created_at)
  WHERE cancelled_at IS NULL;
ALTER TABLE hs_onboarding.eligibility_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hs_onboarding.eligibility_alerts
  FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
COMMIT;
