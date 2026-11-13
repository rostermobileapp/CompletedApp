BEGIN;

CREATE TABLE IF NOT EXISTS public.scorekeeper_game_recalculation_queue (
  game_id varchar PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1,
  due_at timestamptz NOT NULL,
  badges_done boolean NOT NULL DEFAULT false,
  line_combo_done boolean NOT NULL DEFAULT false,
  win_odds_done boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS scorekeeper_game_recalc_due
  ON public.scorekeeper_game_recalculation_queue(due_at, game_id);
ALTER TABLE public.scorekeeper_game_recalculation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scorekeeper_game_recalculation_queue FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.win_chance_recalculation_queue (
  event_type text NOT NULL CHECK (event_type IN ('rsvp_game', 'team')),
  entity_id varchar NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  due_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (event_type, entity_id)
);
CREATE INDEX IF NOT EXISTS win_chance_recalc_due
  ON public.win_chance_recalculation_queue(due_at, event_type, entity_id);
ALTER TABLE public.win_chance_recalculation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.win_chance_recalculation_queue FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_scorekeeper_game_recalculation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game_id varchar;
  v_is_completed boolean;
  v_initial_finalization boolean := false;
  v_due_at timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'games' THEN
    IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
    IF NOT NEW.is_completed THEN RETURN NEW; END IF;
    IF OLD.is_completed IS NOT DISTINCT FROM NEW.is_completed
       AND OLD.home_score IS NOT DISTINCT FROM NEW.home_score
       AND OLD.away_score IS NOT DISTINCT FROM NEW.away_score
       AND OLD.result_type IS NOT DISTINCT FROM NEW.result_type THEN
      RETURN NEW;
    END IF;
    v_game_id := NEW.id;
    v_initial_finalization := OLD.is_completed IS DISTINCT FROM true;
  ELSIF TG_OP = 'DELETE' THEN
    v_game_id := OLD.game_id;
  ELSE
    v_game_id := NEW.game_id;
    IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
  END IF;

  SELECT g.is_completed INTO v_is_completed
  FROM public.games g WHERE g.id = v_game_id;
  IF v_is_completed IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_due_at := CASE
    WHEN v_initial_finalization THEN clock_timestamp()
    ELSE clock_timestamp() + interval '5 minutes'
  END;

  INSERT INTO public.scorekeeper_game_recalculation_queue (
    game_id, revision, due_at, badges_done, line_combo_done, win_odds_done,
    attempts, last_error, locked_until, updated_at
  ) VALUES (
    v_game_id, 1, v_due_at, false, false, false, 0, NULL, NULL, clock_timestamp()
  )
  ON CONFLICT (game_id) DO UPDATE SET
    revision = public.scorekeeper_game_recalculation_queue.revision + 1,
    due_at = EXCLUDED.due_at,
    badges_done = false,
    line_combo_done = false,
    win_odds_done = false,
    attempts = 0,
    last_error = NULL,
    locked_until = NULL,
    updated_at = clock_timestamp();

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_win_chance_rsvp_game()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game_id varchar;
  v_eligible boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_game_id := OLD.game_id;
  ELSE
    v_game_id := NEW.game_id;
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
       AND OLD.team_id IS NOT DISTINCT FROM NEW.team_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT (
    g.is_completed IS NOT TRUE AND g.is_scrimmage IS NOT TRUE
    AND g.home_score IS NULL AND g.away_score IS NULL
    AND (g.scheduled_at AT TIME ZONE COALESCE(l.timezone, 'America/New_York')) > clock_timestamp()
  ) INTO v_eligible
  FROM public.games g
  LEFT JOIN public.leagues l ON l.id = g.league_id
  WHERE g.id = v_game_id;
  IF v_eligible IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.win_chance_recalculation_queue (
    event_type, entity_id, revision, due_at, attempts, last_error, locked_until, updated_at
  ) VALUES (
    'rsvp_game', v_game_id, 1, clock_timestamp() + interval '5 minutes',
    0, NULL, NULL, clock_timestamp()
  )
  ON CONFLICT (event_type, entity_id) DO UPDATE SET
    revision = public.win_chance_recalculation_queue.revision + 1,
    due_at = clock_timestamp() + interval '5 minutes',
    attempts = 0,
    last_error = NULL,
    locked_until = NULL,
    updated_at = clock_timestamp();

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_win_chance_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id varchar;
  v_league_id varchar;
  v_team_id varchar;
BEGIN
  IF NULLIF(current_setting('app.scorekeeper_game_id', true), '') IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'teams' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.wins IS NOT DISTINCT FROM NEW.wins
       AND OLD.losses IS NOT DISTINCT FROM NEW.losses
       AND OLD.ties IS NOT DISTINCT FROM NEW.ties
       AND OLD.goals_for IS NOT DISTINCT FROM NEW.goals_for
       AND OLD.goals_against IS NOT DISTINCT FROM NEW.goals_against THEN
      RETURN NEW;
    END IF;
    v_team_id := NEW.id;
    INSERT INTO public.win_chance_recalculation_queue (
      event_type, entity_id, revision, due_at, attempts, last_error, locked_until, updated_at
    ) VALUES (
      'team', v_team_id, 1, clock_timestamp() + interval '30 seconds',
      0, NULL, NULL, clock_timestamp()
    )
    ON CONFLICT (event_type, entity_id) DO UPDATE SET
      revision = public.win_chance_recalculation_queue.revision + 1,
      due_at = clock_timestamp() + interval '30 seconds',
      attempts = 0, last_error = NULL, locked_until = NULL, updated_at = clock_timestamp();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_league_id := OLD.league_id;
  ELSE
    v_user_id := NEW.user_id;
    v_league_id := NEW.league_id;
    IF TG_OP = 'UPDATE'
       AND OLD.games_played IS NOT DISTINCT FROM NEW.games_played
       AND OLD.goals IS NOT DISTINCT FROM NEW.goals
       AND OLD.assists IS NOT DISTINCT FROM NEW.assists THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_user_id IS NOT NULL THEN
    FOR v_team_id IN
      SELECT DISTINCT t.id
      FROM public.teams t
      WHERE t.league_id = v_league_id
        AND (
          EXISTS (
            SELECT 1 FROM public.team_memberships tm
            WHERE tm.team_id = t.id AND tm.user_id = v_user_id AND tm.status = 'approved'
          )
          OR EXISTS (
            SELECT 1 FROM public.league_memberships lm
            WHERE lm.assigned_team_id = t.id AND lm.user_id = v_user_id AND lm.status = 'approved'
          )
        )
    LOOP
      INSERT INTO public.win_chance_recalculation_queue (
        event_type, entity_id, revision, due_at, attempts, last_error, locked_until, updated_at
      ) VALUES (
        'team', v_team_id, 1, clock_timestamp() + interval '30 seconds',
        0, NULL, NULL, clock_timestamp()
      )
      ON CONFLICT (event_type, entity_id) DO UPDATE SET
        revision = public.win_chance_recalculation_queue.revision + 1,
        due_at = clock_timestamp() + interval '30 seconds',
        attempts = 0, last_error = NULL, locked_until = NULL, updated_at = clock_timestamp();
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS win_chance_game_final_score ON public.games;
DROP TRIGGER IF EXISTS win_chance_game_goals_saved ON public.game_goals;
DROP TRIGGER IF EXISTS win_chance_game_goals_updated ON public.game_goals;
DROP TRIGGER IF EXISTS win_chance_game_goals_deleted ON public.game_goals;
DROP TRIGGER IF EXISTS win_chance_game_goalies_saved ON public.game_goalies;
DROP TRIGGER IF EXISTS win_chance_game_attendance_saved ON public.game_attendance;
DROP TRIGGER IF EXISTS win_chance_team_record_saved ON public.teams;
DROP TRIGGER IF EXISTS win_chance_player_stats_inserted ON public.player_stats;
DROP TRIGGER IF EXISTS win_chance_player_stats_updated ON public.player_stats;
DROP TRIGGER IF EXISTS win_chance_player_stats_deleted ON public.player_stats;
DROP TRIGGER IF EXISTS win_chance_rsvp_queue_saved ON public.game_rsvps;
DROP TRIGGER IF EXISTS win_chance_rsvp_queue_updated ON public.game_rsvps;

CREATE TRIGGER scorekeeper_game_finalization_or_correction
  AFTER UPDATE OF home_score, away_score, is_completed, result_type ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.queue_scorekeeper_game_recalculation();
CREATE TRIGGER scorekeeper_goal_correction
  AFTER INSERT OR UPDATE OR DELETE ON public.game_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_scorekeeper_game_recalculation();
CREATE TRIGGER scorekeeper_penalty_correction
  AFTER INSERT OR UPDATE OR DELETE ON public.game_penalties
  FOR EACH ROW EXECUTE FUNCTION public.queue_scorekeeper_game_recalculation();
CREATE TRIGGER scorekeeper_attendance_correction
  AFTER INSERT OR UPDATE OR DELETE ON public.game_attendance
  FOR EACH ROW EXECUTE FUNCTION public.queue_scorekeeper_game_recalculation();
CREATE TRIGGER scorekeeper_goalie_correction
  AFTER INSERT OR UPDATE OR DELETE ON public.game_goalies
  FOR EACH ROW EXECUTE FUNCTION public.queue_scorekeeper_game_recalculation();
CREATE TRIGGER win_chance_rsvp_game_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.game_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.queue_win_chance_rsvp_game();
CREATE TRIGGER win_chance_team_record_queued
  AFTER UPDATE OF wins, losses, ties, goals_for, goals_against ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.queue_win_chance_team();
CREATE TRIGGER win_chance_player_stats_insert_queued
  AFTER INSERT ON public.player_stats
  FOR EACH ROW WHEN (NEW.games_played > 0 OR NEW.goals > 0 OR NEW.assists > 0)
  EXECUTE FUNCTION public.queue_win_chance_team();
CREATE TRIGGER win_chance_player_stats_update_queued
  AFTER UPDATE OF games_played, goals, assists ON public.player_stats
  FOR EACH ROW WHEN (
    OLD.games_played IS DISTINCT FROM NEW.games_played
    OR OLD.goals IS DISTINCT FROM NEW.goals
    OR OLD.assists IS DISTINCT FROM NEW.assists
  )
  EXECUTE FUNCTION public.queue_win_chance_team();
CREATE TRIGGER win_chance_player_stats_delete_queued
  AFTER DELETE ON public.player_stats
  FOR EACH ROW WHEN (OLD.games_played > 0 OR OLD.goals > 0 OR OLD.assists > 0)
  EXECUTE FUNCTION public.queue_win_chance_team();

REVOKE ALL ON FUNCTION public.queue_scorekeeper_game_recalculation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_win_chance_rsvp_game() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_win_chance_team() FROM PUBLIC, anon, authenticated;

COMMIT;
