ALTER TABLE scrimmages
  ADD COLUMN IF NOT EXISTS timezone varchar;

UPDATE scrimmages AS s
SET timezone = COALESCE(
  (SELECT NULLIF(u.timezone, '') FROM users AS u WHERE u.id = s.creator_id),
  (SELECT NULLIF(l.timezone, '') FROM leagues AS l WHERE l.id = s.league_id),
  'America/New_York'
)
WHERE s.timezone IS NULL OR s.timezone = '';

UPDATE scrimmages
SET timezone = 'America/New_York'
WHERE timezone IS NULL OR timezone = '';

ALTER TABLE scrimmages
  ALTER COLUMN timezone SET DEFAULT 'America/New_York',
  ALTER COLUMN timezone SET NOT NULL;