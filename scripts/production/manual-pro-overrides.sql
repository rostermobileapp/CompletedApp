-- Explicit installation only; never run from startup or the publish build.
CREATE SCHEMA pro_access;
REVOKE ALL ON SCHEMA pro_access FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE pro_access.installation (
  version integer PRIMARY KEY CHECK (version = 1),
  manifest text NOT NULL
);
ALTER TABLE pro_access.installation ENABLE ROW LEVEL SECURITY;

CREATE TABLE pro_access.manual_overrides (
  user_id varchar PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  -- The billing role is kept separate from the visible, overridden role.
  -- On initial grant, the operator supplies the non-complimentary baseline.
  billing_role public.user_role NOT NULL DEFAULT 'free_tier',
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pro_access.manual_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA pro_access FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION pro_access.preserve_manual_pro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- The table trigger supplies the saved baseline when granting/revoking.
  -- Ordinary subscription writers keep recording their actual requested tier.
  UPDATE pro_access.manual_overrides
     SET billing_role = NEW.role
   WHERE user_id = NEW.id AND enabled;
  IF FOUND AND NEW.role = 'free_tier'::public.user_role THEN
    NEW.role := 'player_pro'::public.user_role;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION pro_access.preserve_manual_pro() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER preserve_manual_pro
BEFORE UPDATE OF role ON public.users
FOR EACH ROW EXECUTE FUNCTION pro_access.preserve_manual_pro();

CREATE FUNCTION pro_access.apply_manual_pro() RETURNS trigger
-- Updating public.users also invokes its existing retirement guard. That
-- function uses public relations without qualification and inherits this path.
-- Built-ins remain first and all new relations below are explicitly qualified.
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target varchar;
  baseline public.user_role;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'Manual grants cannot be transferred between accounts';
    END IF;
    IF NEW.enabled = OLD.enabled THEN RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    target := OLD.user_id;
    baseline := OLD.billing_role;
  ELSE
    target := NEW.user_id;
    baseline := NEW.billing_role;
  END IF;
  UPDATE public.users SET role = baseline, updated_at = now(), last_updated = now()
   WHERE id = target;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION pro_access.apply_manual_pro() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER apply_manual_pro
AFTER INSERT OR DELETE OR UPDATE OF enabled, user_id ON pro_access.manual_overrides
FOR EACH ROW EXECUTE FUNCTION pro_access.apply_manual_pro();
