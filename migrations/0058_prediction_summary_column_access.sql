-- Prepared for separate rollout approval. Do not run at application startup.
-- Ordinary clients may read existing member-visible FREE summary columns, not
-- paid odds/scorers/records. Paid details are exclusively served by the
-- resource-authorized game API. No new RLS policy exposes previously denied rows.
BEGIN;
REVOKE SELECT ON public.game_predictions FROM PUBLIC, anon, authenticated;
-- Remove any older column-specific SELECT grants as well as the table grant.
DO $$
DECLARE column_name text;
BEGIN
  FOR column_name IN
    SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid='public.game_predictions'::regclass
      AND a.attnum>0 AND NOT a.attisdropped
  LOOP
    EXECUTE format('REVOKE SELECT (%I) ON public.game_predictions FROM PUBLIC, anon, authenticated',column_name);
  END LOOP;
END $$;
GRANT SELECT (game_id,home_team_id,away_team_id,home_win_probability,
  away_win_probability,tie_probability,calculated_at)
  ON public.game_predictions TO authenticated;
-- Keep game_predictions_team_read, RLS, worker/service_role access, and all
-- other tables' existing default-deny policies unchanged.
COMMIT;
