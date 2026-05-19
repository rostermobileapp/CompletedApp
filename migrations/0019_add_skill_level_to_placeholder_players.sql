-- Add skill_level column to placeholder_players table so CSV-imported
-- placeholder (no-email) players can have their skill level stored and
-- displayed in league management alongside real-account members.
ALTER TABLE placeholder_players ADD COLUMN IF NOT EXISTS skill_level varchar;
