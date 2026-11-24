-- Shared, reviewed guard definitions. Apply only inside an explicitly
-- authorized transaction after creating the private schema and activated_at.
CREATE OR REPLACE FUNCTION hs_parent_security.guard_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=OLD.id AND activated_at IS NOT NULL) THEN
    IF NEW.email IS DISTINCT FROM OLD.email
      OR NEW.email_change IS DISTINCT FROM OLD.email_change
      OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.phone_change IS DISTINCT FROM OLD.phone_change
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
      RAISE EXCEPTION 'parent_verification_required' USING ERRCODE='42501';
    END IF;
    -- Issuing/consuming a recovery email is not password-change authority.
    -- This lets an email owner regain an Auth session without opening the
    -- independently exposed provider password-update endpoint.
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

CREATE OR REPLACE FUNCTION hs_parent_security.guard_factor_or_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE account_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN account_id:=OLD.user_id; ELSE account_id:=NEW.user_id; END IF;
  IF EXISTS(SELECT 1 FROM hs_parent_security.accounts WHERE auth_id=account_id AND activated_at IS NOT NULL)
    OR(TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM hs_parent_security.accounts
      WHERE auth_id=OLD.user_id AND activated_at IS NOT NULL)) THEN
    -- Existing-provider profile refresh must not be confused with linking a
    -- new login identity. Authority identifiers and the registered email are
    -- immutable; only provider-owned display data/timestamps may refresh.
    IF TG_OP='UPDATE' AND TG_TABLE_NAME='identities' THEN
      IF (pg_catalog.to_jsonb(NEW)-ARRAY['identity_data','last_sign_in_at','updated_at','email'])
        IS NOT DISTINCT FROM
          (pg_catalog.to_jsonb(OLD)-ARRAY['identity_data','last_sign_in_at','updated_at','email'])
      AND NEW.identity_data->>'sub' IS NOT DISTINCT FROM OLD.identity_data->>'sub'
      AND NEW.identity_data->>'email' IS NOT DISTINCT FROM OLD.identity_data->>'email' THEN
        RETURN NEW;
      END IF;
    END IF;
    IF TG_OP='UPDATE' AND TG_TABLE_NAME='mfa_factors'
      AND (pg_catalog.to_jsonb(NEW)-ARRAY['last_challenged_at','updated_at'])
        IS NOT DISTINCT FROM (pg_catalog.to_jsonb(OLD)-ARRAY['last_challenged_at','updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'parent_verification_required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $fn$;
-- Auth's user-delete endpoint is administrator-only. Remove the private family
-- first so legitimate account deletion can cascade through identities/children.
-- Ordinary app deletion still requires the backend's parent-authority check.
CREATE OR REPLACE FUNCTION hs_parent_security.guard_delete_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  DELETE FROM hs_parent_security.accounts WHERE auth_id=OLD.id;
  RETURN OLD;
END $fn$;
REVOKE ALL ON FUNCTION hs_parent_security.guard_user(),
  hs_parent_security.guard_factor_or_identity(), hs_parent_security.guard_delete_user()
  FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
