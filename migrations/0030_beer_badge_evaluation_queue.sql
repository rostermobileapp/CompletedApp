-- Queue beer metric reevaluation for changes made through the app or directly in Supabase.
CREATE TABLE IF NOT EXISTS beer_badge_evaluation_queue (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id varchar NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  processed_version integer NOT NULL DEFAULT 0,
  claimed_version integer,
  claimed_at timestamp,
  requested_at timestamp NOT NULL DEFAULT NOW(),
  available_at timestamp NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_beer_badge_evaluation_queue_pending
  ON beer_badge_evaluation_queue(available_at, requested_at);

CREATE OR REPLACE FUNCTION enqueue_beer_badge_evaluation(p_user_id varchar, p_game_id varchar)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO beer_badge_evaluation_queue (user_id, season_id)
  SELECT p_user_id, COALESCE(g.season_id, '')
  FROM games g
  WHERE g.id = p_game_id
  ON CONFLICT (user_id, season_id) DO UPDATE
  SET version = beer_badge_evaluation_queue.version + 1,
      requested_at = NOW(),
      available_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION queue_beer_badge_evaluation_for_count_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.count IS NOT DISTINCT FROM NEW.count
    AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
    AND OLD.game_id IS NOT DISTINCT FROM NEW.game_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
    OR (TG_OP = 'UPDATE'
      AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.game_id IS DISTINCT FROM NEW.game_id)) THEN
    PERFORM enqueue_beer_badge_evaluation(OLD.user_id, OLD.game_id);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    PERFORM enqueue_beer_badge_evaluation(NEW.user_id, NEW.game_id);
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS game_beer_counts_badge_evaluation ON game_beer_counts;
CREATE TRIGGER game_beer_counts_badge_evaluation
AFTER INSERT OR UPDATE OR DELETE ON game_beer_counts
FOR EACH ROW
EXECUTE FUNCTION queue_beer_badge_evaluation_for_count_change();