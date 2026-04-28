-- Track per-participant delivery of the "tournament access window opened" push/email
-- so the recurring tournamentAccessJob does not double-notify on retries.
ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS access_opened_notified_at timestamp;
