ALTER TABLE personal_reminders ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE team_events ADD COLUMN IF NOT EXISTS photo_url text;
