-- Existing support-attributed links retain their provenance.
ALTER TABLE apple_purchase_links
  ADD COLUMN IF NOT EXISTS association_source VARCHAR NOT NULL DEFAULT 'operator_attested',
  ADD COLUMN IF NOT EXISTS role_before_apple VARCHAR,
  ADD COLUMN IF NOT EXISTS stripe_role_before_apple VARCHAR,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id_before_apple VARCHAR;