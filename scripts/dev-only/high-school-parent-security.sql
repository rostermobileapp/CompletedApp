-- Explicit DEV-only installer; never place this in the production migration list.
BEGIN;
CREATE SCHEMA hs_parent_security;
REVOKE ALL ON SCHEMA hs_parent_security FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
CREATE TABLE hs_parent_security.version (version integer PRIMARY KEY CHECK (version=1));
INSERT INTO hs_parent_security.version VALUES (1);
CREATE TABLE hs_parent_security.accounts (
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  parent_email text NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hs_parent_security.challenges (
  id uuid PRIMARY KEY,
  auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('parent_action','password_change')),
  code_digest text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  delivered boolean NOT NULL DEFAULT false,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX ON hs_parent_security.challenges(auth_id, created_at);
CREATE TABLE hs_parent_security.grants (
  token_digest text PRIMARY KEY,
  auth_id uuid NOT NULL REFERENCES hs_parent_security.accounts(auth_id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('parent_action','password_change')),
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX ON hs_parent_security.grants(auth_id,session_id);
CREATE TABLE hs_parent_security.writes (
  transaction_id bigint NOT NULL,
  auth_id uuid NOT NULL,
  password_hash text NOT NULL,
  PRIMARY KEY(transaction_id,auth_id)
);
CREATE TABLE hs_parent_security.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_id uuid NOT NULL,
  session_id uuid,
  event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Defense in depth: no policies means API roles cannot access any rows even if
-- future grants accidentally expose these tables.
ALTER TABLE hs_parent_security.version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_parent_security.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_parent_security.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_parent_security.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_parent_security.writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_parent_security.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hs_parent_security FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hs_parent_security FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA hs_parent_security REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION hs_parent_security.guard_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=OLD.id) THEN
    -- Email replacement and provider recovery remain closed until separately
    -- implemented. Changing a profile or user metadata cannot alter enrollment.
    IF NEW.email IS DISTINCT FROM OLD.email
      OR NEW.email_change IS DISTINCT FROM OLD.email_change
      OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.phone_change IS DISTINCT FROM OLD.phone_change
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.recovery_token IS DISTINCT FROM OLD.recovery_token
      OR NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
      RAISE EXCEPTION 'parent_verification_required' USING ERRCODE='42501';
    END IF;
    IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
      DELETE FROM hs_parent_security.writes
      WHERE transaction_id=pg_catalog.txid_current()
        AND auth_id=OLD.id AND password_hash=NEW.encrypted_password;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'parent_verification_required' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER hs_parent_security_user BEFORE UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION hs_parent_security.guard_user();

CREATE FUNCTION hs_parent_security.guard_factor_or_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE account_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN account_id:=OLD.user_id;
  ELSE account_id:=NEW.user_id; END IF;
  IF EXISTS (SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=account_id)
    OR (TG_OP='UPDATE' AND EXISTS (
      SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=OLD.user_id
    )) THEN
    RAISE EXCEPTION 'parent_verification_required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $fn$;
CREATE TRIGGER hs_parent_security_identity BEFORE INSERT OR UPDATE OR DELETE ON auth.identities
FOR EACH ROW EXECUTE FUNCTION hs_parent_security.guard_factor_or_identity();
CREATE TRIGGER hs_parent_security_mfa BEFORE INSERT OR UPDATE OR DELETE ON auth.mfa_factors
FOR EACH ROW EXECUTE FUNCTION hs_parent_security.guard_factor_or_identity();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hs_parent_security FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
COMMIT;
