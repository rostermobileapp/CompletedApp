BEGIN;

-- Opt-in, lazy-built summaries. This migration creates no summary rows and
-- does not rewrite source data. GAME_SUMMARY_READ_MODE defaults to "off".
CREATE TABLE IF NOT EXISTS public.game_summary_source_revisions (
  summary_type text NOT NULL,
  entity_id text NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_summary_source_revisions_summary_type_entity_id_pk
    PRIMARY KEY (summary_type, entity_id),
  CONSTRAINT game_summary_source_type_check
    CHECK (summary_type IN ('league_standings', 'team_streaks', 'trophy_case'))
);

CREATE TABLE IF NOT EXISTS public.verified_game_summary_cache (
  summary_type text NOT NULL,
  entity_id text NOT NULL,
  scope_key text NOT NULL,
  cache_version integer NOT NULL DEFAULT 1,
  source_revision text NOT NULL,
  payload jsonb NOT NULL,
  matching_reads integer NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT verified_game_summary_cache_summary_type_entity_id_scope_key_pk
    PRIMARY KEY (summary_type, entity_id, scope_key),
  CONSTRAINT verified_game_summary_type_check
    CHECK (summary_type IN ('league_standings', 'team_streaks', 'trophy_case')),
  CONSTRAINT verified_game_summary_version_check CHECK (cache_version > 0),
  CONSTRAINT verified_game_summary_matching_reads_check CHECK (matching_reads >= 0)
);
ALTER TABLE public.verified_game_summary_cache
  ADD COLUMN IF NOT EXISTS cache_version integer NOT NULL DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.verified_game_summary_cache'::regclass
      AND conname = 'verified_game_summary_version_check'
  ) THEN
    ALTER TABLE public.verified_game_summary_cache
      ADD CONSTRAINT verified_game_summary_version_check CHECK (cache_version > 0);
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS verified_game_summary_cache_freshness
  ON public.verified_game_summary_cache (summary_type, entity_id, source_revision);

-- Parity reports retain hashes and counts only; player or league payloads are
-- never copied into the diagnostic table.
CREATE TABLE IF NOT EXISTS public.game_summary_parity_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  summary_type text NOT NULL,
  entity_id text NOT NULL,
  scope_key text NOT NULL,
  source_revision text NOT NULL,
  matched boolean NOT NULL,
  cached_hash varchar(64) NOT NULL,
  raw_hash varchar(64) NOT NULL,
  row_count integer NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_summary_parity_type_check
    CHECK (summary_type IN ('league_standings', 'team_streaks', 'trophy_case')),
  CONSTRAINT game_summary_parity_row_count_check CHECK (row_count >= 0)
);
CREATE INDEX IF NOT EXISTS game_summary_parity_reports_recent
  ON public.game_summary_parity_reports (checked_at, summary_type, matched);

ALTER TABLE public.game_summary_source_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_game_summary_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_summary_parity_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_summary_source_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.verified_game_summary_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.game_summary_parity_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.game_summary_parity_reports_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_game_summary_revision(p_type text, p_entity_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.game_summary_source_revisions (summary_type, entity_id, revision)
  VALUES (p_type, p_entity_id, 1)
  ON CONFLICT (summary_type, entity_id) DO UPDATE SET
    revision = public.game_summary_source_revisions.revision + 1,
    updated_at = clock_timestamp();
$$;

-- Games affect standings, league-wide streak views, and player trophy values.
CREATE OR REPLACE FUNCTION public.invalidate_summaries_for_game_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_game_ids text[] := ARRAY[]::text[];
  v_team_ids text[] := ARRAY[]::text[];
  v_league_ids text[] := ARRAY[]::text[];
  v_id text;
BEGIN
  IF v_old IS NOT NULL THEN
    v_game_ids := array_append(v_game_ids, v_old->>'id');
    v_team_ids := array_append(v_team_ids, v_old->>'home_team_id');
    v_team_ids := array_append(v_team_ids, v_old->>'away_team_id');
    v_league_ids := array_append(v_league_ids, v_old->>'league_id');
  END IF;
  IF v_new IS NOT NULL THEN
    v_game_ids := array_append(v_game_ids, v_new->>'id');
    v_team_ids := array_append(v_team_ids, v_new->>'home_team_id');
    v_team_ids := array_append(v_team_ids, v_new->>'away_team_id');
    v_league_ids := array_append(v_league_ids, v_new->>'league_id');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_game_ids FROM unnest(v_game_ids) value WHERE value IS NOT NULL;
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_team_ids FROM unnest(v_team_ids) value WHERE value IS NOT NULL;
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_league_ids
    FROM (
      SELECT unnest(v_league_ids) AS value
      UNION
      SELECT t.league_id::text FROM public.teams t WHERE t.id = ANY(v_team_ids)
    ) affected WHERE value IS NOT NULL;

  FOREACH v_id IN ARRAY v_league_ids LOOP
    PERFORM public.bump_game_summary_revision('league_standings', v_id);
  END LOOP;

  -- The streak endpoint is scoped by league, even though its URL contains a
  -- team ID. Invalidate every team cache in each affected league.
  FOR v_id IN
    SELECT DISTINCT t.id::text
    FROM public.teams t
    WHERE t.league_id::text = ANY(v_league_ids)
       OR t.id::text = ANY(v_team_ids)
  LOOP
    PERFORM public.bump_game_summary_revision('team_streaks', v_id);
  END LOOP;

  FOR v_id IN
    SELECT DISTINCT affected.user_id
    FROM (
      SELECT r.user_id FROM public.game_rsvps r WHERE r.game_id::text = ANY(v_game_ids)
      UNION SELECT a.user_id FROM public.game_attendance a
        WHERE a.game_id::text = ANY(v_game_ids) AND a.user_id IS NOT NULL
      UNION SELECT g.scorer_id FROM public.game_goals g
        WHERE g.game_id::text = ANY(v_game_ids) AND g.scorer_id IS NOT NULL
      UNION SELECT g.primary_assist_id FROM public.game_goals g
        WHERE g.game_id::text = ANY(v_game_ids) AND g.primary_assist_id IS NOT NULL
      UNION SELECT g.secondary_assist_id FROM public.game_goals g
        WHERE g.game_id::text = ANY(v_game_ids) AND g.secondary_assist_id IS NOT NULL
      UNION SELECT p.player_id FROM public.game_penalties p WHERE p.game_id::text = ANY(v_game_ids)
      UNION SELECT goalie.goalie_user_id FROM public.game_goalies goalie
        WHERE goalie.game_id::text = ANY(v_game_ids)
      UNION SELECT s.first_star_user_id FROM public.game_stars s WHERE s.game_id::text = ANY(v_game_ids)
      UNION SELECT s.second_star_user_id FROM public.game_stars s WHERE s.game_id::text = ANY(v_game_ids)
      UNION SELECT s.third_star_user_id FROM public.game_stars s WHERE s.game_id::text = ANY(v_game_ids)
      UNION SELECT b.user_id FROM public.game_beer_counts b WHERE b.game_id::text = ANY(v_game_ids)
      UNION SELECT tm.user_id FROM public.team_memberships tm WHERE tm.team_id::text = ANY(v_team_ids)
      UNION SELECT lm.user_id FROM public.league_memberships lm
        WHERE lm.assigned_team_id::text = ANY(v_team_ids)
           OR lm.league_id::text = ANY(v_league_ids)
    ) affected
    WHERE affected.user_id IS NOT NULL
  LOOP
    PERFORM public.bump_game_summary_revision('trophy_case', v_id);
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Child-event corrections invalidate only the affected player and league
-- summaries; game score edits are handled by the parent-game trigger above.
CREATE OR REPLACE FUNCTION public.invalidate_summaries_for_game_child_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_game_ids text[] := ARRAY[]::text[];
  v_team_ids text[] := ARRAY[]::text[];
  v_league_ids text[] := ARRAY[]::text[];
  v_home_team_id text;
  v_away_team_id text;
  v_game_league_id text;
  v_user_ids text[] := ARRAY[]::text[];
  v_game_id text;
  v_id text;
BEGIN
  IF v_old IS NOT NULL THEN
    v_game_ids := array_append(v_game_ids, v_old->>'game_id');
    IF TG_TABLE_NAME IN ('game_goals', 'game_penalties', 'game_attendance') THEN
      v_team_ids := array_append(v_team_ids, v_old->>'team_id');
    END IF;
  END IF;
  IF v_new IS NOT NULL THEN
    v_game_ids := array_append(v_game_ids, v_new->>'game_id');
    IF TG_TABLE_NAME IN ('game_goals', 'game_penalties', 'game_attendance') THEN
      v_team_ids := array_append(v_team_ids, v_new->>'team_id');
    END IF;
  END IF;
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_game_ids FROM unnest(v_game_ids) value WHERE value IS NOT NULL;
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_team_ids FROM unnest(v_team_ids) value WHERE value IS NOT NULL;

  IF TG_TABLE_NAME = 'game_goals' THEN
    v_user_ids := ARRAY[
      v_old->>'scorer_id', v_old->>'primary_assist_id', v_old->>'secondary_assist_id',
      v_new->>'scorer_id', v_new->>'primary_assist_id', v_new->>'secondary_assist_id'
    ];
  ELSIF TG_TABLE_NAME = 'game_penalties' THEN
    v_user_ids := ARRAY[v_old->>'player_id', v_new->>'player_id'];
  ELSIF TG_TABLE_NAME = 'game_attendance' THEN
    v_user_ids := ARRAY[v_old->>'user_id', v_new->>'user_id'];
  ELSIF TG_TABLE_NAME = 'game_goalies' THEN
    v_user_ids := ARRAY[v_old->>'goalie_user_id', v_new->>'goalie_user_id'];
  ELSIF TG_TABLE_NAME = 'game_rsvps' THEN
    v_user_ids := ARRAY[v_old->>'user_id', v_new->>'user_id'];
  ELSIF TG_TABLE_NAME = 'game_stars' THEN
    v_user_ids := ARRAY[
      v_old->>'first_star_user_id', v_old->>'second_star_user_id', v_old->>'third_star_user_id',
      v_new->>'first_star_user_id', v_new->>'second_star_user_id', v_new->>'third_star_user_id'
    ];
  ELSIF TG_TABLE_NAME = 'game_beer_counts' THEN
    v_user_ids := ARRAY[v_old->>'user_id', v_new->>'user_id'];
  ELSIF TG_TABLE_NAME = 'scrimmage_requests' THEN
    v_user_ids := ARRAY[v_old->>'player_id', v_new->>'player_id'];
  ELSIF TG_TABLE_NAME IN ('badge_awards', 'badge_progress') THEN
    v_user_ids := ARRAY[v_old->>'user_id', v_new->>'user_id'];
  END IF;

  -- For streak-source tables, resolve the parent game teams and league. Other
  -- child rows may still contribute Trophy Case values for the direct user.
  IF TG_TABLE_NAME IN ('game_goals', 'game_penalties', 'game_attendance') THEN
    FOR v_game_id IN SELECT unnest(v_game_ids) LOOP
      SELECT g.home_team_id::text, g.away_team_id::text, g.league_id::text
        INTO v_home_team_id, v_away_team_id, v_game_league_id
      FROM public.games g WHERE g.id::text = v_game_id;
      IF FOUND THEN
        v_team_ids := array_append(v_team_ids, v_home_team_id);
        v_team_ids := array_append(v_team_ids, v_away_team_id);
        v_league_ids := array_append(v_league_ids, v_game_league_id);
      END IF;
    END LOOP;
  END IF;
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_team_ids FROM unnest(v_team_ids) value WHERE value IS NOT NULL;
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_league_ids
    FROM (
      SELECT unnest(v_league_ids) AS value
      UNION
      SELECT t.league_id::text FROM public.teams t WHERE t.id::text = ANY(v_team_ids)
    ) affected WHERE value IS NOT NULL;

  FOR v_id IN
    SELECT DISTINCT t.id::text
    FROM public.teams t
    WHERE t.league_id::text = ANY(v_league_ids)
       OR t.id::text = ANY(v_team_ids)
  LOOP
    PERFORM public.bump_game_summary_revision('team_streaks', v_id);
  END LOOP;

  FOR v_id IN
    SELECT DISTINCT value FROM unnest(v_user_ids) value WHERE value IS NOT NULL
  LOOP
    PERFORM public.bump_game_summary_revision('trophy_case', v_id);
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Membership and team/season changes affect eligibility, selected seasons,
-- goalie classification, or the roster universe for the raw Trophy Case reads.
CREATE OR REPLACE FUNCTION public.invalidate_summaries_for_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_user_id text;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT value
    FROM unnest(ARRAY[v_old->>'user_id', v_new->>'user_id']) value
    WHERE value IS NOT NULL
  LOOP
    PERFORM public.bump_game_summary_revision('trophy_case', v_user_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_summaries_for_team_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_team_ids text[] := ARRAY[]::text[];
  v_league_ids text[] := ARRAY[]::text[];
  v_id text;
BEGIN
  v_team_ids := ARRAY[v_old->>'id', v_new->>'id'];
  v_league_ids := ARRAY[v_old->>'league_id', v_new->>'league_id'];
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_team_ids FROM unnest(v_team_ids) value WHERE value IS NOT NULL;
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_league_ids FROM unnest(v_league_ids) value WHERE value IS NOT NULL;

  FOR v_id IN SELECT DISTINCT unnest(v_league_ids) LOOP
    PERFORM public.bump_game_summary_revision('league_standings', v_id);
  END LOOP;
  FOR v_id IN
    SELECT DISTINCT t.id::text FROM public.teams t
    WHERE t.league_id::text = ANY(v_league_ids) OR t.id::text = ANY(v_team_ids)
    UNION
    SELECT unnest(v_team_ids)
  LOOP
    PERFORM public.bump_game_summary_revision('team_streaks', v_id);
  END LOOP;
  FOR v_id IN
    SELECT DISTINCT user_id FROM (
      SELECT tm.user_id FROM public.team_memberships tm WHERE tm.team_id::text = ANY(v_team_ids)
      UNION
      SELECT lm.user_id FROM public.league_memberships lm
      WHERE lm.assigned_team_id::text = ANY(v_team_ids) OR lm.league_id::text = ANY(v_league_ids)
    ) affected WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.bump_game_summary_revision('trophy_case', v_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_summaries_for_season_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_season_ids text[] := ARRAY[v_old->>'id', v_new->>'id'];
  v_id text;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_season_ids FROM unnest(v_season_ids) value WHERE value IS NOT NULL;
  FOR v_id IN
    SELECT DISTINCT user_id FROM (
      SELECT tm.user_id FROM public.team_memberships tm
        JOIN public.teams t ON t.id = tm.team_id WHERE t.season_id::text = ANY(v_season_ids)
      UNION SELECT a.user_id FROM public.game_attendance a JOIN public.games g ON g.id = a.game_id
        WHERE g.season_id::text = ANY(v_season_ids) AND a.user_id IS NOT NULL
      UNION SELECT g.scorer_id FROM public.game_goals g JOIN public.games game ON game.id = g.game_id
        WHERE game.season_id::text = ANY(v_season_ids) AND g.scorer_id IS NOT NULL
      UNION SELECT g.primary_assist_id FROM public.game_goals g JOIN public.games game ON game.id = g.game_id
        WHERE game.season_id::text = ANY(v_season_ids) AND g.primary_assist_id IS NOT NULL
      UNION SELECT g.secondary_assist_id FROM public.game_goals g JOIN public.games game ON game.id = g.game_id
        WHERE game.season_id::text = ANY(v_season_ids) AND g.secondary_assist_id IS NOT NULL
      UNION SELECT goalie.goalie_user_id FROM public.game_goalies goalie JOIN public.games g ON g.id = goalie.game_id
        WHERE g.season_id::text = ANY(v_season_ids)
      UNION SELECT penalty.player_id FROM public.game_penalties penalty JOIN public.games g ON g.id = penalty.game_id
        WHERE g.season_id::text = ANY(v_season_ids)
      UNION SELECT lm.user_id FROM public.league_memberships lm JOIN public.teams t ON t.id = lm.assigned_team_id
        WHERE t.season_id::text = ANY(v_season_ids)
      UNION SELECT r.user_id FROM public.game_rsvps r JOIN public.games g ON g.id = r.game_id
        WHERE g.season_id::text = ANY(v_season_ids)
      UNION SELECT a.user_id FROM public.badge_awards a WHERE a.season_id::text = ANY(v_season_ids)
    ) affected WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.bump_game_summary_revision('trophy_case', v_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_summaries_for_league_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_league_ids text[] := ARRAY[v_old->>'id', v_new->>'id'];
  v_id text;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_league_ids FROM unnest(v_league_ids) value WHERE value IS NOT NULL;
  FOR v_id IN
    SELECT DISTINCT user_id FROM (
      SELECT lm.user_id FROM public.league_memberships lm WHERE lm.league_id::text = ANY(v_league_ids)
      UNION SELECT tm.user_id FROM public.team_memberships tm JOIN public.teams t ON t.id = tm.team_id
        WHERE t.league_id::text = ANY(v_league_ids)
      UNION SELECT r.user_id FROM public.game_rsvps r JOIN public.games g ON g.id = r.game_id
        WHERE g.league_id::text = ANY(v_league_ids)
      UNION SELECT a.user_id FROM public.game_attendance a JOIN public.games g ON g.id = a.game_id
        WHERE g.league_id::text = ANY(v_league_ids) AND a.user_id IS NOT NULL
    ) affected WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.bump_game_summary_revision('trophy_case', v_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_summaries_for_scrimmage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_scrimmage_ids text[] := ARRAY[v_old->>'id', v_new->>'id'];
  v_id text;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_scrimmage_ids FROM unnest(v_scrimmage_ids) value WHERE value IS NOT NULL;
  FOR v_id IN
    SELECT DISTINCT player_id::text FROM public.scrimmage_requests
    WHERE scrimmage_id::text = ANY(v_scrimmage_ids)
  LOOP
    PERFORM public.bump_game_summary_revision('trophy_case', v_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_all_trophy_summaries_for_definition_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.bump_game_summary_revision('trophy_case', '*');
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_game_summary_revision(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_summaries_for_game_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_summaries_for_game_child_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_summaries_for_membership_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_summaries_for_team_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_summaries_for_season_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_summaries_for_league_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_summaries_for_scrimmage_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_all_trophy_summaries_for_definition_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS game_summary_games_changed ON public.games;
CREATE TRIGGER game_summary_games_changed
AFTER INSERT OR UPDATE OR DELETE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_change();

DROP TRIGGER IF EXISTS game_summary_goals_changed ON public.game_goals;
CREATE TRIGGER game_summary_goals_changed
AFTER INSERT OR UPDATE OR DELETE ON public.game_goals
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_penalties_changed ON public.game_penalties;
CREATE TRIGGER game_summary_penalties_changed
AFTER INSERT OR UPDATE OR DELETE ON public.game_penalties
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_attendance_changed ON public.game_attendance;
CREATE TRIGGER game_summary_attendance_changed
AFTER INSERT OR UPDATE OR DELETE ON public.game_attendance
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_goalies_changed ON public.game_goalies;
CREATE TRIGGER game_summary_goalies_changed
AFTER INSERT OR UPDATE OR DELETE ON public.game_goalies
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_rsvps_changed ON public.game_rsvps;
CREATE TRIGGER game_summary_rsvps_changed
AFTER INSERT OR UPDATE OR DELETE ON public.game_rsvps
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_stars_changed ON public.game_stars;
CREATE TRIGGER game_summary_stars_changed
AFTER INSERT OR UPDATE OR DELETE ON public.game_stars
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_beer_changed ON public.game_beer_counts;
CREATE TRIGGER game_summary_beer_changed
AFTER INSERT OR UPDATE OR DELETE ON public.game_beer_counts
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_scrimmage_requests_changed ON public.scrimmage_requests;
CREATE TRIGGER game_summary_scrimmage_requests_changed
AFTER INSERT OR UPDATE OR DELETE ON public.scrimmage_requests
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_badge_awards_changed ON public.badge_awards;
CREATE TRIGGER game_summary_badge_awards_changed
AFTER INSERT OR UPDATE OR DELETE ON public.badge_awards
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();
DROP TRIGGER IF EXISTS game_summary_badge_progress_changed ON public.badge_progress;
CREATE TRIGGER game_summary_badge_progress_changed
AFTER INSERT OR UPDATE OR DELETE ON public.badge_progress
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_game_child_change();

DROP TRIGGER IF EXISTS game_summary_team_memberships_changed ON public.team_memberships;
CREATE TRIGGER game_summary_team_memberships_changed
AFTER INSERT OR UPDATE OR DELETE ON public.team_memberships
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_membership_change();
DROP TRIGGER IF EXISTS game_summary_league_memberships_changed ON public.league_memberships;
CREATE TRIGGER game_summary_league_memberships_changed
AFTER INSERT OR UPDATE OR DELETE ON public.league_memberships
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_membership_change();

DROP TRIGGER IF EXISTS game_summary_teams_changed ON public.teams;
CREATE TRIGGER game_summary_teams_changed
AFTER INSERT OR UPDATE OR DELETE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_team_change();
DROP TRIGGER IF EXISTS game_summary_seasons_changed ON public.seasons;
CREATE TRIGGER game_summary_seasons_changed
AFTER INSERT OR UPDATE OR DELETE ON public.seasons
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_season_change();
DROP TRIGGER IF EXISTS game_summary_leagues_changed ON public.leagues;
CREATE TRIGGER game_summary_leagues_changed
AFTER UPDATE OR DELETE ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_league_change();
DROP TRIGGER IF EXISTS game_summary_scrimmages_changed ON public.scrimmages;
CREATE TRIGGER game_summary_scrimmages_changed
AFTER UPDATE OR DELETE ON public.scrimmages
FOR EACH ROW EXECUTE FUNCTION public.invalidate_summaries_for_scrimmage_change();

DROP TRIGGER IF EXISTS game_summary_badge_definitions_changed ON public.badge_definitions;
CREATE TRIGGER game_summary_badge_definitions_changed
AFTER INSERT OR UPDATE OR DELETE ON public.badge_definitions
FOR EACH ROW EXECUTE FUNCTION public.invalidate_all_trophy_summaries_for_definition_change();
DROP TRIGGER IF EXISTS game_summary_badge_tiers_changed ON public.badge_tiers;
CREATE TRIGGER game_summary_badge_tiers_changed
AFTER INSERT OR UPDATE OR DELETE ON public.badge_tiers
FOR EACH ROW EXECUTE FUNCTION public.invalidate_all_trophy_summaries_for_definition_change();

COMMENT ON TABLE public.verified_game_summary_cache IS
  'Lazy, revision-bound cached read payloads; only served after two matching raw parity reads.';
COMMENT ON TABLE public.game_summary_parity_reports IS
  'Hash-only raw-vs-summary parity checks for standings, streaks, and Trophy Case reads.';

COMMIT;
