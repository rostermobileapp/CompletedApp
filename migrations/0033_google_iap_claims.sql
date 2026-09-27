CREATE TABLE IF NOT EXISTS google_iap_claims (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  claimed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_iap_claims_user_id ON google_iap_claims (user_id);