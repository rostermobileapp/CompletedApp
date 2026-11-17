BEGIN;

ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'stripe';

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS card_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.scrimmages
  ADD COLUMN IF NOT EXISTS card_payment_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.stripe_connected_accounts (
  user_id varchar PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_account_id varchar UNIQUE,
  creation_idempotency_key varchar NOT NULL UNIQUE,
  country varchar(2) NOT NULL DEFAULT 'US',
  details_submitted boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  transfers_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  requirements_currently_due text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stripe_connected_accounts_account
  ON public.stripe_connected_accounts(stripe_account_id);

CREATE TABLE IF NOT EXISTS public.organizer_card_payments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payment_request_id varchar NOT NULL REFERENCES public.payment_requests(id) ON DELETE RESTRICT,
  recipient_id varchar NOT NULL REFERENCES public.payment_request_recipients(id) ON DELETE RESTRICT,
  payer_user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  organizer_user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  stripe_account_id varchar NOT NULL REFERENCES public.stripe_connected_accounts(stripe_account_id) ON DELETE RESTRICT,
  base_amount_cents integer NOT NULL CHECK (base_amount_cents > 0),
  service_fee_cents integer NOT NULL CHECK (service_fee_cents >= 0),
  total_amount_cents integer NOT NULL CHECK (total_amount_cents = base_amount_cents + service_fee_cents),
  currency varchar(3) NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  status varchar NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded', 'disputed')),
  idempotency_key varchar NOT NULL UNIQUE,
  stripe_checkout_session_id varchar UNIQUE,
  stripe_payment_intent_id varchar UNIQUE,
  stripe_charge_id varchar UNIQUE,
  stripe_application_fee_id varchar,
  stripe_transfer_id varchar UNIQUE,
  transfer_amount_cents integer,
  stripe_processing_fee_cents integer,
  receipt_url text,
  refund_id varchar UNIQUE,
  refund_status varchar,
  refunded_at timestamptz,
  transfer_reversal_id varchar UNIQUE,
  transfer_reversed_cents integer,
  dispute_id varchar UNIQUE,
  dispute_status varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizer_card_payments_request
  ON public.organizer_card_payments(payment_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_organizer_card_payments_payer
  ON public.organizer_card_payments(payer_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_organizer_card_payments_organizer
  ON public.organizer_card_payments(organizer_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_organizer_card_payments_payment_intent
  ON public.organizer_card_payments(stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS public.stripe_connect_webhook_events (
  event_id varchar PRIMARY KEY,
  event_type varchar NOT NULL,
  payment_id varchar REFERENCES public.organizer_card_payments(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.stripe_connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_card_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connect_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_connected_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.organizer_card_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.stripe_connect_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stripe_connected_accounts TO authenticated;
GRANT SELECT ON public.organizer_card_payments TO authenticated;

DROP POLICY IF EXISTS stripe_connected_accounts_owner_read ON public.stripe_connected_accounts;
CREATE POLICY stripe_connected_accounts_owner_read
  ON public.stripe_connected_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS organizer_card_payments_participant_read ON public.organizer_card_payments;
CREATE POLICY organizer_card_payments_participant_read
  ON public.organizer_card_payments FOR SELECT TO authenticated
  USING (payer_user_id = auth.uid()::text OR organizer_user_id = auth.uid()::text);

COMMIT;
