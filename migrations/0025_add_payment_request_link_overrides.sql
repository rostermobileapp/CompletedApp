ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS venmo_link_override text,
  ADD COLUMN IF NOT EXISTS cashapp_link_override text;