BEGIN;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS scorekeeper_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS scorekeeper_saved_by varchar REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS games_scorekeeper_saved_pending
  ON public.games(scorekeeper_saved_at, id)
  WHERE scorekeeper_saved_at IS NOT NULL AND is_completed = false;

COMMIT;
