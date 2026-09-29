CREATE TABLE IF NOT EXISTS revenuecat_native_accounts (
  user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  app_user_id VARCHAR(100) NOT NULL UNIQUE,
  base_role VARCHAR(32) NOT NULL DEFAULT 'free_tier',
  applied_role VARCHAR(32),
  manual_role VARCHAR(32),
  stripe_role VARCHAR(32),
  stripe_expires_at TIMESTAMPTZ,
  shown_at TIMESTAMPTZ,
  claim_token_hash CHAR(64),
  claim_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE revenuecat_native_accounts
  ADD COLUMN IF NOT EXISTS manual_role VARCHAR(32);
ALTER TABLE revenuecat_native_accounts
  ADD COLUMN IF NOT EXISTS stripe_role VARCHAR(32);
ALTER TABLE revenuecat_native_accounts
  ADD COLUMN IF NOT EXISTS stripe_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS apple_iap_claims (
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_transaction_id VARCHAR NOT NULL UNIQUE,
  product_id VARCHAR NOT NULL,
  expires_at TIMESTAMPTZ,
  environment VARCHAR(16),
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, original_transaction_id)
);
ALTER TABLE apple_iap_claims
  ADD COLUMN IF NOT EXISTS environment VARCHAR(16);
ALTER TABLE apple_purchase_links
  ADD COLUMN IF NOT EXISTS environment VARCHAR(16);

CREATE INDEX IF NOT EXISTS apple_iap_claims_expiry_idx
  ON apple_iap_claims (expires_at);

CREATE INDEX IF NOT EXISTS apple_purchase_links_expiry_idx
  ON apple_purchase_links (expires_at);
CREATE INDEX IF NOT EXISTS google_iap_claims_expiry_user_idx
  ON google_iap_claims (expires_at, user_id);
CREATE INDEX IF NOT EXISTS revenuecat_native_accounts_stripe_expiry_idx
  ON revenuecat_native_accounts (stripe_expires_at);

CREATE TABLE IF NOT EXISTS revenuecat_native_entitlements (
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id VARCHAR NOT NULL,
  store VARCHAR NOT NULL CHECK (store IN ('app_store', 'play_store')),
  role VARCHAR(32) NOT NULL CHECK (role IN ('player_pro', 'commissioner')),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  role_reconciled_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, product_id, store)
);
ALTER TABLE revenuecat_native_entitlements
  ADD COLUMN IF NOT EXISTS role_reconciled_at TIMESTAMPTZ;

-- Preserve paid legacy roles as manual access only when no durable billing
-- source can attribute them. Source rows are considered evidence even after
-- expiry, so expired paid subscriptions are never migrated into manual access.
UPDATE revenuecat_native_accounts a
   SET manual_role = CASE
     WHEN u.role::text IN ('player_pro', 'secondary_commissioner', 'commissioner')
       THEN u.role::text
     ELSE a.base_role
   END
  FROM users u
 WHERE u.id = a.user_id
   AND (a.manual_role IS NULL OR a.manual_role = 'free_tier')
   AND (u.role::text IN ('player_pro', 'secondary_commissioner', 'commissioner')
        OR a.base_role IN ('player_pro', 'secondary_commissioner', 'commissioner'))
   AND u.stripe_customer_id IS NULL
   AND u.stripe_subscription_id IS NULL
   AND u.iap_original_transaction_id IS NULL
   AND (a.stripe_role IS NULL OR a.stripe_role = 'free_tier')
   AND a.stripe_expires_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM apple_purchase_links p WHERE p.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM apple_iap_claims p WHERE p.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM google_iap_claims g WHERE g.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM revenuecat_native_entitlements n WHERE n.user_id = u.id);
UPDATE revenuecat_native_accounts
   SET manual_role = 'free_tier'
 WHERE manual_role IS NULL;
ALTER TABLE revenuecat_native_accounts
  ALTER COLUMN manual_role SET DEFAULT 'free_tier';
ALTER TABLE revenuecat_native_accounts
  ALTER COLUMN manual_role SET NOT NULL;

CREATE INDEX IF NOT EXISTS revenuecat_native_entitlements_expiry_idx
  ON revenuecat_native_entitlements (expires_at);

CREATE TABLE IF NOT EXISTS revenuecat_native_webhook_events (
  event_id VARCHAR(200) PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenuecat_native_webhook_inbox (
  event_id VARCHAR(200) PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  app_user_id VARCHAR(100),
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token VARCHAR(64),
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS revenuecat_native_webhook_inbox_claim_idx
  ON revenuecat_native_webhook_inbox (status, available_at, lease_until, received_at);
CREATE INDEX IF NOT EXISTS revenuecat_native_webhook_inbox_pending_idx
  ON revenuecat_native_webhook_inbox (available_at, received_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS revenuecat_native_webhook_inbox_lease_idx
  ON revenuecat_native_webhook_inbox (lease_until, received_at)
  WHERE status = 'processing';