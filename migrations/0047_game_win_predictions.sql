-- Win-chance predictions are calculated by a Supabase Edge Function and are
-- never written by browser or application-server clients.
--
-- Before applying this migration, enable pg_net and create these two named
-- secrets in Supabase Vault for this database:
--   win_chance_project_url  -> https://<project-ref>.supabase.co
--   win_chance_secret_key   -> the project's default API secret key
-- See supabase/win-chance-setup.md. Secret values must not be committed here.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS allow_ties boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.game_predictions (
  game_id varchar PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  home_team_id varchar NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_team_id varchar NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  home_win_probability numeric(6,5) NOT NULL CHECK (home_win_probability BETWEEN 0 AND 1),
  away_win_probability numeric(6,5) NOT NULL CHECK (away_win_probability BETWEEN 0 AND 1),
  tie_probability numeric(6,5) NOT NULL DEFAULT 0 CHECK (tie_probability BETWEEN 0 AND 1),
  expected_goals_home numeric(7,3) NOT NULL CHECK (expected_goals_home >= 0),
  expected_goals_away numeric(7,3) NOT NULL CHECK (expected_goals_away >= 0),
  moneyline_home varchar(16) NOT NULL,
  moneyline_away varchar(16) NOT NULL,
  projected_score_home integer NOT NULL CHECK (projected_score_home >= 0),
  projected_score_away integer NOT NULL CHECK (projected_score_away >= 0),
  win_by_two_home numeric(6,5) NOT NULL CHECK (win_by_two_home BETWEEN 0 AND 1),
  win_by_two_away numeric(6,5) NOT NULL CHECK (win_by_two_away BETWEEN 0 AND 1),
  over_under_line numeric(6,2) NOT NULL CHECK (over_under_line >= 0),
  over_probability numeric(6,5) NOT NULL CHECK (over_probability BETWEEN 0 AND 1),
  under_probability numeric(6,5) NOT NULL CHECK (under_probability BETWEEN 0 AND 1),
  top_scorers_home jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_scorers_away jsonb NOT NULL DEFAULT '[]'::jsonb,
  home_record_snapshot jsonb NOT NULL,
  away_record_snapshot jsonb NOT NULL,
  home_streak integer NOT NULL DEFAULT 0,
  away_streak integer NOT NULL DEFAULT 0,
  goalie_home varchar,
  goalie_away varchar,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id)
);

CREATE INDEX IF NOT EXISTS game_predictions_home_team_idx
  ON public.game_predictions(home_team_id);
CREATE INDEX IF NOT EXISTS game_predictions_away_team_idx
  ON public.game_predictions(away_team_id);

ALTER TABLE public.game_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_predictions_team_read ON public.game_predictions;
CREATE POLICY game_predictions_team_read
  ON public.game_predictions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.user_id = auth.uid()::text
        AND tm.status = 'approved'
        AND tm.team_id IN (home_team_id, away_team_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.league_memberships lm
      WHERE lm.user_id = auth.uid()::text
        AND lm.status = 'approved'
        AND lm.assigned_team_id IN (home_team_id, away_team_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id IN (home_team_id, away_team_id)
        AND t.captain_id = auth.uid()::text
    )
  );
REVOKE ALL ON public.game_predictions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.game_predictions FROM authenticated;
GRANT SELECT ON public.game_predictions TO authenticated;
GRANT ALL ON public.game_predictions TO service_role;

CREATE TABLE IF NOT EXISTS public.win_chance_dispatch_locks (
  team_id varchar PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  last_dispatched_at timestamptz NOT NULL
);
ALTER TABLE public.win_chance_dispatch_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.win_chance_dispatch_locks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.win_chance_dispatch_team(p_team_id varchar)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_accepted boolean;
  v_project_url text;
  v_secret_key text;
BEGIN
  IF p_team_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.win_chance_dispatch_locks(team_id, last_dispatched_at)
  VALUES (p_team_id, '-infinity'::timestamptz)
  ON CONFLICT (team_id) DO UPDATE
    SET last_dispatched_at = clock_timestamp()
    WHERE public.win_chance_dispatch_locks.last_dispatched_at
      <= clock_timestamp() - interval '30 seconds'
  RETURNING true INTO v_accepted;

  IF v_accepted IS DISTINCT FROM true THEN
    RETURN;
  END IF;

  UPDATE public.win_chance_dispatch_locks
    SET last_dispatched_at = clock_timestamp()
    WHERE team_id = p_team_id;

  SELECT decrypted_secret INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'win_chance_project_url'
  LIMIT 1;
  SELECT decrypted_secret INTO v_secret_key
  FROM vault.decrypted_secrets
  WHERE name = 'win_chance_secret_key'
  LIMIT 1;

  IF NULLIF(trim(v_project_url), '') IS NULL
     OR NULLIF(trim(v_secret_key), '') IS NULL THEN
    RAISE EXCEPTION 'Win-chance Vault configuration is missing';
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/recalculate-win-chance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_secret_key
    ),
    body := jsonb_build_object('team_id', p_team_id),
    timeout_milliseconds := 2000
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.win_chance_dispatch_locks
    SET last_dispatched_at = '-infinity'::timestamptz
    WHERE team_id = p_team_id;
  RAISE WARNING 'Win-chance dispatch failed for team %: %', p_team_id, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.win_chance_dispatch_game_if_completed(p_game_id varchar)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game record;
BEGIN
  SELECT home_team_id, away_team_id
    INTO v_game
    FROM public.games
    WHERE id = p_game_id
      AND is_completed
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM public.win_chance_dispatch_team(v_game.home_team_id);
  PERFORM public.win_chance_dispatch_team(v_game.away_team_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.win_chance_game_score_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_completed
     AND NEW.home_score IS NOT NULL
     AND NEW.away_score IS NOT NULL
     AND (
       OLD.is_completed IS DISTINCT FROM NEW.is_completed
       OR OLD.home_score IS DISTINCT FROM NEW.home_score
       OR OLD.away_score IS DISTINCT FROM NEW.away_score
     ) THEN
    PERFORM public.win_chance_dispatch_team(NEW.home_team_id);
    PERFORM public.win_chance_dispatch_team(NEW.away_team_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.win_chance_game_stats_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game_id varchar;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_game_id := OLD.game_id;
  ELSE
    v_game_id := NEW.game_id;
  END IF;
  PERFORM public.win_chance_dispatch_game_if_completed(v_game_id);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.win_chance_team_record_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.wins IS DISTINCT FROM NEW.wins
     OR OLD.losses IS DISTINCT FROM NEW.losses
     OR OLD.ties IS DISTINCT FROM NEW.ties
     OR OLD.goals_for IS DISTINCT FROM NEW.goals_for
     OR OLD.goals_against IS DISTINCT FROM NEW.goals_against THEN
    PERFORM public.win_chance_dispatch_team(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.win_chance_player_stats_trigger()
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
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_league_id := OLD.league_id;
  ELSE
    v_user_id := NEW.user_id;
    v_league_id := NEW.league_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    FOR v_team_id IN
      SELECT DISTINCT t.id
      FROM public.teams t
      WHERE t.league_id = v_league_id
        AND (
          EXISTS (
            SELECT 1 FROM public.team_memberships tm
            WHERE tm.team_id = t.id
              AND tm.user_id = v_user_id
              AND tm.status = 'approved'
          )
          OR EXISTS (
            SELECT 1 FROM public.league_memberships lm
            WHERE lm.assigned_team_id = t.id
              AND lm.user_id = v_user_id
              AND lm.status = 'approved'
          )
        )
    LOOP
      PERFORM public.win_chance_dispatch_team(v_team_id);
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.win_chance_tie_setting_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_id varchar;
BEGIN
  IF OLD.allow_ties IS DISTINCT FROM NEW.allow_ties THEN
    FOR v_team_id IN
      SELECT id FROM public.teams WHERE league_id = NEW.id
    LOOP
      PERFORM public.win_chance_dispatch_team(v_team_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.win_chance_rsvp_no_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'not_attending'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.win_chance_dispatch_team(NEW.team_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS win_chance_game_insert ON public.games;
DROP FUNCTION IF EXISTS public.win_chance_game_insert_trigger();

DROP TRIGGER IF EXISTS win_chance_game_final_score ON public.games;
CREATE TRIGGER win_chance_game_final_score
  AFTER UPDATE OF home_score, away_score, is_completed ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.win_chance_game_score_trigger();

DROP TRIGGER IF EXISTS win_chance_game_goals_saved ON public.game_goals;
CREATE TRIGGER win_chance_game_goals_saved
  AFTER INSERT ON public.game_goals
  FOR EACH ROW WHEN (NEW.is_submitted)
  EXECUTE FUNCTION public.win_chance_game_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_game_goals_updated ON public.game_goals;
CREATE TRIGGER win_chance_game_goals_updated
  AFTER UPDATE ON public.game_goals
  FOR EACH ROW WHEN (
    NEW.is_submitted
    AND (
      OLD.is_submitted IS DISTINCT FROM NEW.is_submitted
      OR OLD.team_id IS DISTINCT FROM NEW.team_id
      OR OLD.scorer_id IS DISTINCT FROM NEW.scorer_id
      OR OLD.primary_assist_id IS DISTINCT FROM NEW.primary_assist_id
      OR OLD.secondary_assist_id IS DISTINCT FROM NEW.secondary_assist_id
    )
  )
  EXECUTE FUNCTION public.win_chance_game_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_game_goals_deleted ON public.game_goals;
CREATE TRIGGER win_chance_game_goals_deleted
  AFTER DELETE ON public.game_goals
  FOR EACH ROW WHEN (OLD.is_submitted)
  EXECUTE FUNCTION public.win_chance_game_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_game_goalies_saved ON public.game_goalies;
CREATE TRIGGER win_chance_game_goalies_saved
  AFTER INSERT OR UPDATE OR DELETE ON public.game_goalies
  FOR EACH ROW EXECUTE FUNCTION public.win_chance_game_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_game_attendance_saved ON public.game_attendance;
CREATE TRIGGER win_chance_game_attendance_saved
  AFTER INSERT OR UPDATE OR DELETE ON public.game_attendance
  FOR EACH ROW EXECUTE FUNCTION public.win_chance_game_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_team_record_saved ON public.teams;
CREATE TRIGGER win_chance_team_record_saved
  AFTER UPDATE OF wins, losses, ties, goals_for, goals_against ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.win_chance_team_record_trigger();

DROP TRIGGER IF EXISTS win_chance_tie_setting_saved ON public.leagues;
CREATE TRIGGER win_chance_tie_setting_saved
  AFTER UPDATE OF allow_ties ON public.leagues
  FOR EACH ROW
  WHEN (OLD.allow_ties IS DISTINCT FROM NEW.allow_ties)
  EXECUTE FUNCTION public.win_chance_tie_setting_trigger();

DROP TRIGGER IF EXISTS win_chance_player_stats_inserted ON public.player_stats;
CREATE TRIGGER win_chance_player_stats_inserted
  AFTER INSERT ON public.player_stats
  FOR EACH ROW
  WHEN (NEW.games_played > 0 OR NEW.goals > 0 OR NEW.assists > 0)
  EXECUTE FUNCTION public.win_chance_player_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_player_stats_updated ON public.player_stats;
CREATE TRIGGER win_chance_player_stats_updated
  AFTER UPDATE OF games_played, goals, assists ON public.player_stats
  FOR EACH ROW
  WHEN (
    OLD.games_played IS DISTINCT FROM NEW.games_played
    OR OLD.goals IS DISTINCT FROM NEW.goals
    OR OLD.assists IS DISTINCT FROM NEW.assists
  )
  EXECUTE FUNCTION public.win_chance_player_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_player_stats_deleted ON public.player_stats;
CREATE TRIGGER win_chance_player_stats_deleted
  AFTER DELETE ON public.player_stats
  FOR EACH ROW
  WHEN (OLD.games_played > 0 OR OLD.goals > 0 OR OLD.assists > 0)
  EXECUTE FUNCTION public.win_chance_player_stats_trigger();

DROP TRIGGER IF EXISTS win_chance_rsvp_no ON public.game_rsvps;
CREATE TRIGGER win_chance_rsvp_no
  AFTER INSERT ON public.game_rsvps
  FOR EACH ROW WHEN (NEW.status = 'not_attending')
  EXECUTE FUNCTION public.win_chance_rsvp_no_trigger();

DROP TRIGGER IF EXISTS win_chance_rsvp_no_updated ON public.game_rsvps;
CREATE TRIGGER win_chance_rsvp_no_updated
  AFTER UPDATE OF status ON public.game_rsvps
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'not_attending')
  EXECUTE FUNCTION public.win_chance_rsvp_no_trigger();

REVOKE ALL ON FUNCTION public.win_chance_dispatch_team(varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.win_chance_dispatch_game_if_completed(varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.win_chance_game_score_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.win_chance_game_stats_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.win_chance_team_record_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.win_chance_player_stats_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.win_chance_tie_setting_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.win_chance_rsvp_no_trigger() FROM PUBLIC, anon, authenticated;

COMMIT;
