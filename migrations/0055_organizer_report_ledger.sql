BEGIN;

ALTER TABLE public.organizer_card_payments
  ADD COLUMN IF NOT EXISTS application_fee_refunded_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_amount_cents integer,
  ADD COLUMN IF NOT EXISTS dispute_fee_cents integer,
  ADD COLUMN IF NOT EXISTS dispute_balance_net_cents integer,
  ADD COLUMN IF NOT EXISTS dispute_balance_transaction_count integer NOT NULL DEFAULT 0;

COMMIT;
