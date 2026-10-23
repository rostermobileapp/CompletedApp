-- MANUAL/OPT-IN migration. Never run this on application startup.
BEGIN;
CREATE TABLE public.team_award_config (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  enabled boolean NOT NULL DEFAULT false,
  active_limit integer NOT NULL DEFAULT 5 CHECK(active_limit > 0),
  removal_limit integer NOT NULL DEFAULT 10 CHECK(removal_limit > 0)
);
INSERT INTO public.team_award_config DEFAULT VALUES;
CREATE TABLE public.team_award_settings (
  team_id varchar PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'America/New_York'
);
CREATE TABLE public.team_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id varchar NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40),
  description text NOT NULL DEFAULT '' CHECK(length(description) <= 140),
  preset_icon text NOT NULL DEFAULT 'trophy' CHECK(preset_icon IN ('trophy','puck','star','skate','shield','flame')),
  image_url text,
  image_version uuid NOT NULL DEFAULT gen_random_uuid(),
  cadence text NOT NULL CHECK(cadence IN ('game','week','month','season')),
  created_by varchar REFERENCES public.users(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.team_awards(team_id);
CREATE TABLE public.award_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id uuid NOT NULL REFERENCES public.team_awards(id) ON DELETE CASCADE,
  player_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  granted_by varchar REFERENCES public.users(id) ON DELETE SET NULL,
  period_key text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  holder_valid boolean NOT NULL DEFAULT true,
  UNIQUE(award_id, period_key)
);
CREATE INDEX ON public.award_grants(award_id,granted_at DESC);
-- Immutable recognition events; award_grants remains the one current row/period.
-- Reassigning that row must never erase the earlier recipient, captain or time.
CREATE TABLE public.award_grant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.award_grants(id) ON DELETE CASCADE,
  award_id uuid NOT NULL REFERENCES public.team_awards(id) ON DELETE CASCADE,
  player_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  granted_by varchar REFERENCES public.users(id) ON DELETE SET NULL,
  period_key text NOT NULL,
  granted_at timestamptz NOT NULL
);
CREATE INDEX ON public.award_grant_events(award_id,granted_at DESC);
CREATE TABLE public.bg_removal_usage (
  team_id varchar NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY(team_id,month_key)
);
-- Outbox: a new revision is queued only for an actual holder change.
CREATE TABLE public.team_award_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.award_grants(id) ON DELETE CASCADE,
  player_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  award_name text NOT NULL,
  team_id varchar NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  discarded_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);

CREATE FUNCTION public.ta_captain(t text, u text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u IS NOT NULL AND EXISTS(SELECT 1 FROM users WHERE id=u AND deleted_at IS NULL)
 AND (EXISTS(SELECT 1 FROM teams WHERE id=t AND captain_id=u)
 OR EXISTS(SELECT 1 FROM team_memberships WHERE team_id=t AND user_id=u AND is_captain));
$$;
CREATE FUNCTION public.ta_rostered(t text, u text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u IS NOT NULL AND EXISTS(SELECT 1 FROM users WHERE id=u AND deleted_at IS NULL)
 AND (EXISTS(SELECT 1 FROM team_memberships WHERE team_id=t AND user_id=u AND status='approved')
 OR EXISTS(SELECT 1 FROM league_memberships WHERE assigned_team_id=t AND user_id=u AND status='approved'));
$$;
CREATE FUNCTION public.ta_member(t text, u text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT ta_captain(t,u) OR ta_rostered(t,u);
$$;
CREATE FUNCTION public.ta_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE((SELECT enabled FROM team_award_config WHERE id),false);
$$;
CREATE FUNCTION public.ta_assert(t text, manage boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ta_enabled() THEN RAISE EXCEPTION 'Team awards are not enabled' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NOT ta_member(t,auth.uid()::text)
    OR (manage AND NOT ta_captain(t,auth.uid()::text)) THEN
   RAISE EXCEPTION 'Only authorized team members may access these awards' USING ERRCODE='42501';
 END IF;
END $$;

-- The sole authoritative calculator; called by both read API and grant RPC.
CREATE FUNCTION public.team_award_window(p_team text, p_cadence text, p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE z text; local_now timestamp; opened timestamptz; closed timestamptz;
 period text; gid text; local_open timestamp;
BEGIN
 SELECT COALESCE(s.timezone,'America/New_York') INTO z FROM teams t
 LEFT JOIN team_award_settings s ON s.team_id=t.id WHERE t.id=p_team;
 IF z IS NULL THEN RETURN jsonb_build_object('periodKey',null,'opensAt',null,'closesAt',null,'gameId',null); END IF;
 local_now := p_now AT TIME ZONE z;
 IF p_cadence='week' THEN
   local_open:=date_trunc('week',local_now);
   opened:=local_open AT TIME ZONE z;
   closed:=(local_open+interval '1 week') AT TIME ZONE z;
   period:=to_char(local_open-interval '1 day','IYYY-"W"IW');
 ELSIF p_cadence='month' THEN
   local_open:=date_trunc('month',local_now);
   opened:=local_open AT TIME ZONE z;
   closed:=(local_open+interval '1 month') AT TIME ZONE z;
   period:=to_char(local_open-interval '1 day','YYYY-MM');
 ELSIF p_cadence='game' THEN
   -- Game timestamps are LEAGUE wall-clock strings, never UTC strings.
   SELECT g.id,(g.scheduled_at AT TIME ZONE COALESCE(l.timezone,z))+interval '30 minutes'
     INTO gid,opened FROM games g LEFT JOIN leagues l ON l.id=g.league_id
     WHERE (g.home_team_id=p_team OR g.away_team_id=p_team)
       AND (g.scheduled_at AT TIME ZONE COALESCE(l.timezone,z))+interval '30 minutes' <= p_now
     ORDER BY g.scheduled_at AT TIME ZONE COALESCE(l.timezone,z) DESC,g.id DESC LIMIT 1;
   IF gid IS NOT NULL THEN
     SELECT min((g.scheduled_at AT TIME ZONE COALESCE(l.timezone,z))+interval '30 minutes')
       INTO closed FROM games g LEFT JOIN leagues l ON l.id=g.league_id
       WHERE (g.home_team_id=p_team OR g.away_team_id=p_team)
       AND (g.scheduled_at AT TIME ZONE COALESCE(l.timezone,z))+interval '30 minutes' > opened;
     closed:=COALESCE(closed,opened+interval '14 days'); period:=gid;
   END IF;
 ELSIF p_cadence='season' THEN
   -- Playoffs live in tournament_matches, not games. Scrimmages are excluded.
   WITH boundaries AS (
     SELECT s.id, COALESCE(
       (CASE WHEN s.end_date::time='00:00:00' THEN s.end_date+interval '1 day' ELSE s.end_date END)
          AT TIME ZONE COALESCE(l.timezone,z),
       (SELECT max(g.scheduled_at) AT TIME ZONE COALESCE(l.timezone,z) FROM games g
        WHERE g.season_id=s.id AND NOT g.is_scrimmage AND (g.home_team_id=p_team OR g.away_team_id=p_team))
     ) AS ends FROM seasons s JOIN teams t ON t.league_id=s.league_id
       LEFT JOIN leagues l ON l.id=s.league_id WHERE t.id=p_team
       AND (t.season_id IS NULL OR t.season_id=s.id)
   )
   SELECT id,ends INTO period,opened FROM boundaries WHERE ends<=p_now ORDER BY ends DESC,id DESC LIMIT 1;
   IF period IS NOT NULL THEN
     SELECT min(CASE WHEN s.end_date::time='00:00:00' THEN s.end_date+interval '1 day' ELSE s.end_date END
       AT TIME ZONE COALESCE(l.timezone,z)) INTO closed
       FROM seasons s JOIN teams t ON t.league_id=s.league_id LEFT JOIN leagues l ON l.id=s.league_id
       WHERE t.id=p_team AND s.end_date IS NOT NULL
       AND (CASE WHEN s.end_date::time='00:00:00' THEN s.end_date+interval '1 day' ELSE s.end_date END
         AT TIME ZONE COALESCE(l.timezone,z))>opened;
   END IF;
 END IF;
 IF opened IS NULL OR (closed IS NOT NULL AND p_now>=closed) THEN period:=null; END IF;
 RETURN jsonb_build_object('periodKey',period,'opensAt',opened,'closesAt',closed,'gameId',gid);
END $$;

CREATE FUNCTION public.ta_award_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE maximum integer;
BEGIN
 -- Serialize creations, archival and reactivation for the same team.
 PERFORM 1 FROM teams WHERE id=NEW.team_id FOR UPDATE;
 SELECT active_limit INTO maximum FROM team_award_config WHERE id;
 IF NOT NEW.archived AND (SELECT count(*) FROM team_awards WHERE team_id=NEW.team_id AND NOT archived AND id<>NEW.id)>=maximum THEN
   RAISE EXCEPTION 'This team already has the maximum active awards' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.team_id<>OLD.team_id OR NEW.cadence<>OLD.cadence) THEN
   RAISE EXCEPTION 'Team and cadence cannot change after creation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER team_awards_limit BEFORE INSERT OR UPDATE ON public.team_awards FOR EACH ROW EXECUTE FUNCTION public.ta_award_limit();

CREATE FUNCTION public.team_award_save(p_team text,p_name text,p_description text,p_cadence text,p_preset text,
 p_id uuid DEFAULT null,p_remove_image boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 PERFORM ta_assert(p_team,true);
 IF p_id IS NULL THEN
   INSERT INTO team_awards(team_id,name,description,cadence,preset_icon,created_by)
    VALUES(p_team,trim(p_name),p_description,p_cadence,p_preset,auth.uid()::text) RETURNING id INTO result;
 ELSE
   UPDATE team_awards SET name=trim(p_name),description=p_description,preset_icon=p_preset,
     image_url=CASE WHEN p_remove_image THEN null ELSE image_url END,
     image_version=gen_random_uuid()
     WHERE id=p_id AND team_id=p_team AND NOT archived RETURNING id INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'Award not found' USING ERRCODE='P0002'; END IF;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.team_award_archive(p_team text,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM ta_assert(p_team,true);
 UPDATE team_awards SET archived=true WHERE id=p_id AND team_id=p_team;
 IF NOT FOUND THEN RAISE EXCEPTION 'Award not found' USING ERRCODE='P0002'; END IF;
END $$;
CREATE FUNCTION public.team_award_set_timezone(p_team text,p_timezone text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM ta_assert(p_team,true);
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'Choose a valid IANA time zone' USING ERRCODE='22023'; END IF;
 INSERT INTO team_award_settings VALUES(p_team,p_timezone) ON CONFLICT(team_id) DO UPDATE SET timezone=EXCLUDED.timezone;
END $$;
CREATE FUNCTION public.team_award_attach_image(p_team text,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM ta_assert(p_team,true);
 UPDATE team_awards SET image_url=p_team||'/'||p_id::text||'.png',image_version=gen_random_uuid()
 WHERE id=p_id AND team_id=p_team AND NOT archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Award not found' USING ERRCODE='P0002'; END IF;
END $$;
CREATE FUNCTION public.team_award_grant(p_team text,p_id uuid,p_player text,p_period text,p_reassign boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a team_awards; w jsonb; previous award_grants; result uuid;
BEGIN
 -- Same roster locks used for removal: grant cannot pass a stale eligibility check.
 PERFORM 1 FROM teams WHERE id=p_team FOR UPDATE;
 PERFORM ta_assert(p_team,true);
 SELECT * INTO a FROM team_awards WHERE id=p_id AND team_id=p_team AND NOT archived FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Award not found' USING ERRCODE='P0002'; END IF;
 IF NOT ta_rostered(p_team,p_player) THEN RAISE EXCEPTION 'Choose an active roster player' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM team_memberships WHERE team_id=p_team AND user_id=p_player FOR SHARE;
 PERFORM 1 FROM league_memberships WHERE assigned_team_id=p_team AND user_id=p_player FOR SHARE;
 IF NOT ta_rostered(p_team,p_player) THEN RAISE EXCEPTION 'Player is no longer active' USING ERRCODE='22023'; END IF;
 w:=team_award_window(p_team,a.cadence);
 IF w->>'periodKey' IS NULL OR w->>'periodKey' IS DISTINCT FROM p_period THEN
   RAISE EXCEPTION 'This award window has changed or is closed. Refresh and try again.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM award_grants WHERE award_id=p_id AND period_key=p_period;
 IF previous.id IS NOT NULL THEN
   IF NOT p_reassign THEN RAISE EXCEPTION 'Already awarded this period. Choose Reassign to change the holder.' USING ERRCODE='23505'; END IF;
   IF previous.player_id=p_player AND previous.holder_valid THEN RETURN jsonb_build_object('id',previous.id,'changed',false); END IF;
   UPDATE award_grants SET player_id=p_player,granted_by=auth.uid()::text,granted_at=clock_timestamp(),holder_valid=true
     WHERE id=previous.id RETURNING id INTO result;
 ELSE
   INSERT INTO award_grants(award_id,player_id,granted_by,period_key)
     VALUES(p_id,p_player,auth.uid()::text,p_period) RETURNING id INTO result;
 END IF;
 INSERT INTO award_grant_events(grant_id,award_id,player_id,granted_by,period_key,granted_at)
   SELECT id,award_id,player_id,granted_by,period_key,granted_at FROM award_grants WHERE id=result;
 UPDATE team_award_pushes SET discarded_at=clock_timestamp()
   WHERE grant_id=result AND sent_at IS NULL AND discarded_at IS NULL;
 INSERT INTO team_award_pushes(grant_id,player_id,award_name,team_id) VALUES(result,p_player,a.name,p_team);
 RETURN jsonb_build_object('id',result,'changed',true);
END $$;

CREATE FUNCTION public.ta_invalidate_holder() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid text; uid text;
BEGIN
 uid:=OLD.user_id;
 IF TG_TABLE_NAME='team_memberships' THEN tid:=OLD.team_id; ELSE tid:=OLD.assigned_team_id; END IF;
 IF tid IS NOT NULL AND NOT ta_rostered(tid,uid) THEN
   UPDATE award_grants g SET holder_valid=false FROM team_awards a
    WHERE g.award_id=a.id AND a.team_id=tid AND g.player_id=uid AND g.holder_valid;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER team_awards_roster_removal AFTER DELETE OR UPDATE ON public.team_memberships
 FOR EACH ROW EXECUTE FUNCTION public.ta_invalidate_holder();
CREATE TRIGGER team_awards_league_removal AFTER DELETE OR UPDATE ON public.league_memberships
 FOR EACH ROW EXECUTE FUNCTION public.ta_invalidate_holder();

CREATE FUNCTION public.team_award_list(p_team text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM ta_assert(p_team);
 SELECT jsonb_build_object(
   'enabled',true,'canManage',ta_captain(p_team,auth.uid()::text),
   'timezone',COALESCE((SELECT timezone FROM team_award_settings WHERE team_id=p_team),'America/New_York'),
   'activeLimit',c.active_limit,'removalLimit',c.removal_limit,
   'roster',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',concat_ws(' ',u.first_name,u.last_name)) ORDER BY u.first_name,u.id)
      FROM users u WHERE ta_rostered(p_team,u.id)),'[]'::jsonb),
   'awards',COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'id',a.id,'teamId',a.team_id,'name',a.name,'description',a.description,'cadence',a.cadence,
     'presetIcon',a.preset_icon,'imageUrl',a.image_url,'imageVersion',a.image_version,'archived',a.archived,
     'window',team_award_window(p_team,a.cadence),
     'holder',(SELECT CASE WHEN g.holder_valid AND ta_rostered(p_team,g.player_id) THEN
       jsonb_build_object('id',u.id,'name',concat_ws(' ',u.first_name,u.last_name)) ELSE null END
       FROM award_grants g LEFT JOIN users u ON u.id=g.player_id WHERE g.award_id=a.id ORDER BY g.granted_at DESC,g.id DESC LIMIT 1),
     'currentGrant',(SELECT jsonb_build_object('id',g.id,'playerId',g.player_id,'playerName',COALESCE(nullif(concat_ws(' ',u.first_name,u.last_name),''),'Removed player'),
       'periodKey',g.period_key,'grantedAt',g.granted_at) FROM award_grants g LEFT JOIN users u ON u.id=g.player_id
       WHERE g.award_id=a.id AND g.period_key=team_award_window(p_team,a.cadence)->>'periodKey' LIMIT 1),
      'history',COALESCE((SELECT jsonb_agg(h.entry ORDER BY h.granted_at DESC,h.id DESC) FROM (
        SELECT g.id,g.granted_at,jsonb_build_object('id',g.id,'playerId',g.player_id,'playerName',COALESCE(nullif(concat_ws(' ',u.first_name,u.last_name),''),'Removed player'),
         'grantedById',g.granted_by,'grantedByName',COALESCE(nullif(concat_ws(' ',c.first_name,c.last_name),''),'Removed captain'),
         'periodKey',g.period_key,'grantedAt',g.granted_at) entry FROM award_grant_events g LEFT JOIN users u ON u.id=g.player_id
         LEFT JOIN users c ON c.id=g.granted_by
        WHERE g.award_id=a.id ORDER BY g.granted_at DESC LIMIT 100) h),'[]'::jsonb)
   ) ORDER BY a.created_at,a.id) FROM team_awards a WHERE a.team_id=p_team),'[]'::jsonb))
 INTO result FROM team_award_config c WHERE c.id;
 RETURN result;
END $$;
CREATE FUNCTION public.team_award_holders() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'teamId',a.team_id,'teamName',t.name,'playerId',g.player_id,
   'name',a.name,'presetIcon',a.preset_icon,'imageUrl',a.image_url,'imageVersion',a.image_version) ORDER BY a.created_at,a.id),'[]'::jsonb)
 FROM team_awards a JOIN teams t ON t.id=a.team_id
 JOIN LATERAL(SELECT * FROM award_grants WHERE award_id=a.id ORDER BY granted_at DESC,id DESC LIMIT 1) g ON true
 WHERE ta_enabled() AND ta_member(a.team_id,auth.uid()::text) AND NOT a.archived
   AND g.holder_valid AND ta_rostered(a.team_id,g.player_id);
$$;
-- Service-only quota reservation; Edge Function rechecks the caller through JWT.
CREATE FUNCTION public.team_award_reserve_removal(p_team text,p_id uuid,p_user text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE month text; maximum integer; n integer;
BEGIN
 IF NOT ta_enabled() OR NOT ta_captain(p_team,p_user) OR NOT EXISTS(
   SELECT 1 FROM team_awards WHERE id=p_id AND team_id=p_team AND NOT archived)
 THEN RAISE EXCEPTION 'Only the team captain may remove backgrounds' USING ERRCODE='42501'; END IF;
 SELECT to_char(now() AT TIME ZONE COALESCE(s.timezone,'America/New_York'),'YYYY-MM')
 INTO month FROM teams t LEFT JOIN team_award_settings s ON s.team_id=t.id WHERE t.id=p_team;
 SELECT removal_limit INTO maximum FROM team_award_config WHERE id;
 INSERT INTO bg_removal_usage(team_id,month_key,used) VALUES(p_team,month,1)
 ON CONFLICT(team_id,month_key) DO UPDATE SET used=bg_removal_usage.used+1
 WHERE bg_removal_usage.used<maximum RETURNING used INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'This team has used its background removals for this month' USING ERRCODE='23514'; END IF;
END $$;

ALTER TABLE public.team_award_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_award_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_grant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bg_removal_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_award_pushes ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_award_settings_read ON public.team_award_settings FOR SELECT TO authenticated
 USING(ta_enabled() AND ta_member(team_id,auth.uid()::text));
CREATE POLICY team_awards_read ON public.team_awards FOR SELECT TO authenticated
 USING(ta_enabled() AND ta_member(team_id,auth.uid()::text));
CREATE POLICY award_grants_read ON public.award_grants FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM team_awards a WHERE a.id=award_id AND ta_enabled() AND ta_member(a.team_id,auth.uid()::text)));
CREATE POLICY award_grant_events_read ON public.award_grant_events FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM team_awards a WHERE a.id=award_id AND ta_enabled() AND ta_member(a.team_id,auth.uid()::text)));
-- No direct DML: all mutations go through validating RPCs (including service paths).
REVOKE ALL ON public.team_award_config,public.team_award_settings,public.team_awards,
  public.award_grants,public.award_grant_events,public.bg_removal_usage,public.team_award_pushes FROM anon,authenticated;
GRANT SELECT ON public.team_award_settings,public.team_awards,public.award_grants,public.award_grant_events TO authenticated;

DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND (p.proname LIKE 'ta\_%' ESCAPE '\' OR p.proname LIKE 'team_award\_%' ESCAPE '\')
 LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC, anon, authenticated'; END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ta_enabled(),public.ta_member(text,text),public.ta_rostered(text,text),public.ta_captain(text,text),
 public.team_award_list(text),public.team_award_holders(),
 public.team_award_save(text,text,text,text,text,uuid,boolean),public.team_award_archive(text,uuid),
 public.team_award_set_timezone(text,text),public.team_award_attach_image(text,uuid),
 public.team_award_grant(text,uuid,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_award_reserve_removal(text,uuid,text) TO service_role;
COMMIT;
