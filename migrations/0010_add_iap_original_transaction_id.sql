-- Add Apple IAP original transaction ID field to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS iap_original_transaction_id VARCHAR;
