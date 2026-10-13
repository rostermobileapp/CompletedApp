ALTER TABLE account_user_merges ADD COLUMN IF NOT EXISTS authorization_league_id varchar;
ALTER TABLE account_user_merges ADD COLUMN IF NOT EXISTS activity_provenance jsonb NOT NULL DEFAULT '{}';
ALTER TABLE account_user_merges ADD COLUMN IF NOT EXISTS merge_policy jsonb NOT NULL DEFAULT '{}';
