-- The game row stays locked until the prediction write commits. This prevents
-- a concurrent scorekeeper finalization from having its historical forecast
-- overwritten between an Edge Function's eligibility read and upsert.
CREATE OR REPLACE FUNCTION public.win_chance_save_prediction(
  p_prediction jsonb, p_league_id text, p_season_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_prediction public.game_predictions;
  v_game public.games;
  v_timezone text;
  v_saved boolean;
BEGIN
  v_prediction := jsonb_populate_record(NULL::public.game_predictions, p_prediction);
  SELECT * INTO v_game FROM public.games
    WHERE id = v_prediction.game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT COALESCE(timezone, 'America/New_York') INTO v_timezone
    FROM public.leagues WHERE id = p_league_id;
  IF v_timezone IS NULL OR v_game.is_completed OR v_game.is_scrimmage
     OR v_game.home_score IS NOT NULL OR v_game.away_score IS NOT NULL
     OR v_game.home_team_id IS DISTINCT FROM v_prediction.home_team_id
     OR v_game.away_team_id IS DISTINCT FROM v_prediction.away_team_id
     OR v_game.league_id IS DISTINCT FROM p_league_id
     OR v_game.season_id IS DISTINCT FROM p_season_id
     OR (v_game.scheduled_at AT TIME ZONE v_timezone) <= clock_timestamp()
     OR v_prediction.calculated_at IS NULL
  THEN RETURN false; END IF;

  INSERT INTO public.game_predictions SELECT (v_prediction).*
  ON CONFLICT (game_id) DO UPDATE SET
    home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id,
    home_win_probability = EXCLUDED.home_win_probability, away_win_probability = EXCLUDED.away_win_probability,
    tie_probability = EXCLUDED.tie_probability,
    expected_goals_home = EXCLUDED.expected_goals_home, expected_goals_away = EXCLUDED.expected_goals_away,
    moneyline_home = EXCLUDED.moneyline_home, moneyline_away = EXCLUDED.moneyline_away,
    projected_score_home = EXCLUDED.projected_score_home, projected_score_away = EXCLUDED.projected_score_away,
    win_by_two_home = EXCLUDED.win_by_two_home, win_by_two_away = EXCLUDED.win_by_two_away,
    over_under_line = EXCLUDED.over_under_line, over_probability = EXCLUDED.over_probability,
    under_probability = EXCLUDED.under_probability,
    top_scorers_home = EXCLUDED.top_scorers_home, top_scorers_away = EXCLUDED.top_scorers_away,
    home_record_snapshot = EXCLUDED.home_record_snapshot, away_record_snapshot = EXCLUDED.away_record_snapshot,
    home_streak = EXCLUDED.home_streak, away_streak = EXCLUDED.away_streak,
    goalie_home = EXCLUDED.goalie_home, goalie_away = EXCLUDED.goalie_away,
    calculated_at = EXCLUDED.calculated_at
  WHERE public.game_predictions.calculated_at <= EXCLUDED.calculated_at
  RETURNING true INTO v_saved;
  RETURN COALESCE(v_saved, false);
END;
$$;
REVOKE ALL ON FUNCTION public.win_chance_save_prediction(jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.win_chance_save_prediction(jsonb, text, text) TO service_role;

-- Changing a completed result from regulation to OT/SO changes the record
-- input even if the score stays unchanged. Keep this event narrowly scoped;
-- schedule edits and page reads still do not dispatch prediction work.
CREATE OR REPLACE FUNCTION public.win_chance_game_score_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_completed AND NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL
     AND (
       OLD.is_completed IS DISTINCT FROM NEW.is_completed
       OR OLD.home_score IS DISTINCT FROM NEW.home_score
       OR OLD.away_score IS DISTINCT FROM NEW.away_score
       OR OLD.result_type IS DISTINCT FROM NEW.result_type
     ) THEN
    PERFORM public.win_chance_dispatch_team(NEW.home_team_id);
    PERFORM public.win_chance_dispatch_team(NEW.away_team_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS win_chance_game_final_score ON public.games;
CREATE TRIGGER win_chance_game_final_score
  AFTER UPDATE OF home_score, away_score, is_completed, result_type ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.win_chance_game_score_trigger();
