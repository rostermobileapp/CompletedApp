BEGIN;
-- Persist the stop-collection state before calling Stripe so network failures
-- can be retried safely without reopening onboarding or checkout.
ALTER TABLE public.organizer_direct_accounts
  ADD COLUMN IF NOT EXISTS disconnect_requested_at timestamptz;
COMMIT;
