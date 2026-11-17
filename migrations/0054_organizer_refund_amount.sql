-- Record money actually returned, independently of the non-refundable fee.
ALTER TABLE public.organizer_card_payments
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0
  CHECK (refunded_amount_cents >= 0);

-- Previously completed refunds returned the entire charge under the old rule.
UPDATE public.organizer_card_payments
SET refunded_amount_cents = total_amount_cents
WHERE status = 'refunded' AND refunded_amount_cents = 0;
