BEGIN;

-- Keep historical Express account mappings immutable. The registry supports
-- both their existing charges and new, separately onboarded Standard accounts.
CREATE TABLE IF NOT EXISTS public.organizer_stripe_account_registry (
  stripe_account_id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  account_kind varchar NOT NULL CHECK (account_kind IN ('legacy','direct')),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.organizer_stripe_account_registry (stripe_account_id,user_id,account_kind)
SELECT stripe_account_id,user_id,'legacy' FROM public.stripe_connected_accounts
WHERE stripe_account_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.organizer_direct_accounts (
  user_id varchar PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  stripe_account_id varchar UNIQUE REFERENCES public.organizer_stripe_account_registry(stripe_account_id) ON DELETE RESTRICT,
  creation_idempotency_key varchar NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizer_card_payments
  ADD COLUMN IF NOT EXISTS payment_flow varchar NOT NULL DEFAULT 'destination'
    CHECK (payment_flow IN ('destination','direct')),
  ADD COLUMN IF NOT EXISTS processing_surcharge_cents integer NOT NULL DEFAULT 0
    CHECK (processing_surcharge_cents >= 0),
  ADD COLUMN IF NOT EXISTS quote_id varchar,
  ADD COLUMN IF NOT EXISTS quote_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_token_id varchar,
  ADD COLUMN IF NOT EXISTS confirmation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_policy_fingerprint varchar,
  ADD COLUMN IF NOT EXISTS fee_explanation text;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.organizer_card_payments'::regclass
      AND contype='f' AND confrelid='public.stripe_connected_accounts'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.organizer_card_payments DROP CONSTRAINT %I',c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organizer_card_payments_registry_fk'
      AND conrelid='public.organizer_card_payments'::regclass) THEN
    ALTER TABLE public.organizer_card_payments ADD CONSTRAINT organizer_card_payments_registry_fk
      FOREIGN KEY (stripe_account_id) REFERENCES public.organizer_stripe_account_registry(stripe_account_id) ON DELETE RESTRICT;
  END IF;
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.organizer_card_payments'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%total_amount_cents%'
      AND pg_get_constraintdef(oid) LIKE '%base_amount_cents%'
      AND pg_get_constraintdef(oid) LIKE '%service_fee_cents%'
  LOOP
    EXECUTE format('ALTER TABLE public.organizer_card_payments DROP CONSTRAINT %I',c.conname);
  END LOOP;
END $$;
ALTER TABLE public.organizer_card_payments ADD CONSTRAINT organizer_card_total_with_surcharge
  CHECK (total_amount_cents::bigint=base_amount_cents::bigint+service_fee_cents::bigint+processing_surcharge_cents::bigint);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organizer_direct_no_unreviewed_service_fee'
      AND conrelid='public.organizer_card_payments'::regclass) THEN
    ALTER TABLE public.organizer_card_payments ADD CONSTRAINT organizer_direct_no_unreviewed_service_fee
      CHECK (payment_flow<>'direct' OR service_fee_cents=0);
  END IF;
END $$;

ALTER TABLE public.organizer_stripe_account_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_direct_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizer_stripe_account_registry FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.organizer_direct_accounts FROM PUBLIC,anon,authenticated;
-- An organizer must not obtain a player's unconsumed confirmation token or
-- approval nonce through Supabase before the player approves the quoted total.
REVOKE SELECT ON public.organizer_card_payments FROM authenticated;
DO $$
DECLARE visible_columns text;
BEGIN
  SELECT string_agg(format('%I',attname),',') INTO visible_columns
  FROM pg_attribute WHERE attrelid='public.organizer_card_payments'::regclass
    AND attnum>0 AND NOT attisdropped
    AND attname NOT IN ('confirmation_token_id','quote_id','quote_expires_at','confirmation_started_at');
  EXECUTE format('GRANT SELECT (%s) ON public.organizer_card_payments TO authenticated',visible_columns);
END $$;
-- Access is through authenticated server routes, not arbitrary account claims.
COMMIT;
