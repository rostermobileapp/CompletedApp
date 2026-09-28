CREATE TABLE IF NOT EXISTS apple_purchase_links (
  user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_id VARCHAR NOT NULL UNIQUE,
  original_transaction_id VARCHAR NOT NULL UNIQUE,
  product_id VARCHAR NOT NULL,
  original_purchased_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_by_apple BOOLEAN NOT NULL DEFAULT FALSE,
  apple_revocation_reason VARCHAR,
  revoked_period_expires_at TIMESTAMPTZ,
  last_apple_signed_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing Apple and Google claims both occupy this column. Refuse duplicates
-- across either platform, including the older client-driven verify endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS users_iap_original_transaction_unique
  ON users (iap_original_transaction_id)
  WHERE iap_original_transaction_id IS NOT NULL;

ALTER TABLE google_iap_claims ADD COLUMN IF NOT EXISTS product_id VARCHAR;
ALTER TABLE google_iap_claims ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;