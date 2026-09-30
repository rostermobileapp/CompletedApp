-- Durable account retirement/audit record. Keep the source user row (and its
-- original identity) as a tombstone; never cascade-delete it during a merge.
CREATE TABLE IF NOT EXISTS account_user_merges (
  source_user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  survivor_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_display_id VARCHAR,
  source_email VARCHAR,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  preview_fingerprint VARCHAR(64) NOT NULL,
  CONSTRAINT account_user_merges_distinct_users CHECK (source_user_id <> survivor_user_id)
);

CREATE INDEX IF NOT EXISTS account_user_merges_survivor_idx
  ON account_user_merges (survivor_user_id);

-- A still-valid Supabase token or delayed upsert must never revive a retired
-- source, including when an upsert began before the merge committed.
CREATE OR REPLACE FUNCTION reject_retired_account_reactivation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM account_user_merges WHERE source_user_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Retired account cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_reject_retired_reactivation ON users;
CREATE TRIGGER users_reject_retired_reactivation
  BEFORE INSERT OR UPDATE ON users FOR EACH ROW
  EXECUTE FUNCTION reject_retired_account_reactivation();