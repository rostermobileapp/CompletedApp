ALTER TABLE substitute_requests ALTER COLUMN game_id DROP NOT NULL;
ALTER TABLE substitute_requests ADD COLUMN IF NOT EXISTS team_event_id varchar REFERENCES team_events(id);
CREATE INDEX IF NOT EXISTS idx_substitute_requests_team_event_id ON substitute_requests(team_event_id);
