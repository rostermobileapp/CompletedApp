-- Run once AFTER 0044_custom_team_awards.sql, in the same Supabase project.
-- Existing recognition is historical; only NEW grants should celebrate.
BEGIN;
ALTER TABLE public.award_grant_events
  ADD COLUMN celebration_acknowledged_at timestamptz DEFAULT now();
ALTER TABLE public.award_grant_events
  ALTER COLUMN celebration_acknowledged_at DROP DEFAULT;
CREATE INDEX award_grant_events_pending_celebration
  ON public.award_grant_events(player_id,granted_at,id)
  WHERE celebration_acknowledged_at IS NULL;

CREATE FUNCTION public.team_award_pending_celebrations() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Sign in to view your awards' USING ERRCODE='42501';
 END IF;
 RETURN (
   SELECT COALESCE(jsonb_agg(entry ORDER BY granted_at,id),'[]'::jsonb) FROM (
     SELECT e.id,e.granted_at,jsonb_build_object(
       'id',e.id,'awardId',a.id,'teamId',a.team_id,'teamName',t.name,
       'name',a.name,'description',a.description,'presetIcon',a.preset_icon,
       'imageUrl',a.image_url,'imageVersion',a.image_version,
       'grantedAt',e.granted_at,
       'grantedByName',COALESCE(NULLIF(trim(concat_ws(' ',u.first_name,u.last_name)),''),'Your captain')
     ) AS entry
     FROM award_grant_events e
     JOIN team_awards a ON a.id=e.award_id
     JOIN teams t ON t.id=a.team_id
     JOIN award_grants g ON g.id=e.grant_id
     LEFT JOIN users u ON u.id=e.granted_by
     WHERE ta_enabled() AND e.player_id=auth.uid()::text
       AND e.celebration_acknowledged_at IS NULL
       AND NOT a.archived AND g.holder_valid
       AND g.player_id=e.player_id AND g.granted_at=e.granted_at
       AND ta_rostered(a.team_id,e.player_id)
       AND g.id=(SELECT latest.id FROM award_grants latest
         WHERE latest.award_id=a.id ORDER BY latest.granted_at DESC,latest.id DESC LIMIT 1)
     ORDER BY e.granted_at,e.id LIMIT 20
   ) pending
 );
END $$;

CREATE FUNCTION public.team_award_acknowledge_celebration(p_event uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Sign in to acknowledge your award' USING ERRCODE='42501';
 END IF;
 UPDATE award_grant_events
   SET celebration_acknowledged_at=COALESCE(celebration_acknowledged_at,now())
   WHERE id=p_event AND player_id=auth.uid()::text;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Award recognition not found' USING ERRCODE='P0002';
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.team_award_pending_celebrations() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.team_award_acknowledge_celebration(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.team_award_pending_celebrations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_award_acknowledge_celebration(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
