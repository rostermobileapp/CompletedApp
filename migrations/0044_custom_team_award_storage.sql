-- Apply in Supabase AFTER 0044_custom_team_awards.sql. Not run on startup.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('team-award-images','team-award-images',false,5242880,ARRAY['image/png','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY team_award_image_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='team-award-images' AND public.ta_enabled() AND EXISTS(
 SELECT 1 FROM public.team_awards a WHERE storage.objects.name=a.team_id||'/'||a.id::text||'.png'
 AND public.ta_member(a.team_id,auth.uid()::text)));
CREATE POLICY team_award_image_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 bucket_id='team-award-images' AND public.ta_enabled() AND EXISTS(
 SELECT 1 FROM public.team_awards a WHERE storage.objects.name=a.team_id||'/'||a.id::text||'.png'
 AND NOT a.archived AND public.ta_captain(a.team_id,auth.uid()::text)));
CREATE POLICY team_award_image_update ON storage.objects FOR UPDATE TO authenticated USING(
 bucket_id='team-award-images' AND public.ta_enabled() AND EXISTS(
 SELECT 1 FROM public.team_awards a WHERE storage.objects.name=a.team_id||'/'||a.id::text||'.png'
 AND NOT a.archived AND public.ta_captain(a.team_id,auth.uid()::text)))
 WITH CHECK(bucket_id='team-award-images' AND public.ta_enabled() AND EXISTS(
 SELECT 1 FROM public.team_awards a WHERE storage.objects.name=a.team_id||'/'||a.id::text||'.png'
 AND NOT a.archived AND public.ta_captain(a.team_id,auth.uid()::text)));
COMMIT;
