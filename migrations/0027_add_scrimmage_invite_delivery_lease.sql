ALTER TABLE scrimmages
  ADD COLUMN IF NOT EXISTS invite_delivery_claimed_at timestamp,
  ADD COLUMN IF NOT EXISTS invite_delivery_claim_id varchar;

-- Older builds could create player-visible invite artifacts before an
-- occurrence was actually delivered. Remove those once during migration;
-- retries must preserve newly successful per-recipient delivery progress.
DELETE FROM user_notifications notification
USING scrimmages scrimmage
WHERE notification.scrimmage_id = scrimmage.id
  AND notification.type = 'scrimmage_invite'
  AND scrimmage.invite_sent_at IS NULL;

DELETE FROM announcement_visibility visibility
USING scrimmages scrimmage
WHERE visibility.announcement_id = scrimmage.announcement_id
  AND scrimmage.invite_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scrimmages_invite_delivery_claim
  ON scrimmages (invite_delivery_claimed_at)
  WHERE invite_sent_at IS NULL;