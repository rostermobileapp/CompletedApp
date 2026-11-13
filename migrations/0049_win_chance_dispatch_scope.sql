BEGIN;

-- Existing installations need the same narrow dispatch scope as fresh installs.
DROP TRIGGER IF EXISTS win_chance_rsvp_no ON public.game_rsvps;
DROP TRIGGER IF EXISTS win_chance_rsvp_no_updated ON public.game_rsvps;
DROP FUNCTION IF EXISTS public.win_chance_rsvp_no_trigger();

DROP TRIGGER IF EXISTS win_chance_tie_setting_saved ON public.leagues;
DROP FUNCTION IF EXISTS public.win_chance_tie_setting_trigger();

COMMIT;
