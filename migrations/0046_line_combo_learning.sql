BEGIN;
SELECT pg_advisory_xact_lock(hashtext('roster:line-combo-learning-schema'));
CREATE TABLE IF NOT EXISTS public.line_combo_forecasts (
  game_id varchar NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_id varchar NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  line_type text NOT NULL CHECK (line_type IN ('forward','defense')),
  line_number integer NOT NULL,
  player_ids text[] NOT NULL CHECK (cardinality(player_ids) IN (2,3)),
  source text NOT NULL CHECK (source IN ('game','template')),
  starts_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  base_ppg double precision NOT NULL CHECK (base_ppg >= 0),
  predicted_ppg double precision NOT NULL CHECK (predicted_ppg >= 0),
  model_version text NOT NULL,
  actual_points integer CHECK (actual_points >= 0),
  evaluated_at timestamptz,
  exclusion_reason text,
  PRIMARY KEY (game_id,team_id,line_type,line_number),
  CHECK (captured_at < starts_at)
);
ALTER TABLE public.line_combo_forecasts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS line_combo_forecasts_training
  ON public.line_combo_forecasts(team_id,starts_at DESC) WHERE actual_points IS NOT NULL;
COMMIT;
