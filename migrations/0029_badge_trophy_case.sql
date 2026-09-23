-- Badge catalog, scoped awards, evaluator progress, and offline earned events.
-- The application also runs equivalent idempotent DDL at startup for existing
-- deployments; keep this file for normal schema migration workflows.
DO $$ BEGIN CREATE TYPE badge_category AS ENUM ('nhl_trophy', 'team_badge', 'achievement'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE badge_achievement_type AS ENUM ('multiplier', 'tiered', 'onetime'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE badge_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'legend'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE badge_trigger_type AS ENUM ('manual', 'metric', 'event'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE badge_status AS ENUM ('draft', 'published', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS badge_definitions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(100) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description text NOT NULL,
  locked_hint text,
  category badge_category NOT NULL,
  achievement_type badge_achievement_type,
  trigger_type badge_trigger_type NOT NULL DEFAULT 'manual',
  trigger_key varchar(100),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_path text,
  placeholder_color varchar(20) NOT NULL DEFAULT '#C9A84C',
  owner_team_id varchar REFERENCES teams(id) ON DELETE CASCADE,
  owner_season_id varchar REFERENCES seasons(id) ON DELETE CASCADE,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  status badge_status NOT NULL DEFAULT 'draft',
  published_at timestamp,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_badge_definitions_category_status ON badge_definitions(category, status);
CREATE INDEX IF NOT EXISTS idx_badge_definitions_owner_team ON badge_definitions(owner_team_id);
CREATE INDEX IF NOT EXISTS idx_badge_definitions_owner_season ON badge_definitions(owner_season_id);

CREATE TABLE IF NOT EXISTS badge_tiers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_definition_id varchar NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  tier badge_tier NOT NULL,
  threshold integer NOT NULL,
  image_path text,
  color varchar(20),
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_badge_tiers_definition_tier UNIQUE (badge_definition_id, tier)
);
CREATE INDEX IF NOT EXISTS idx_badge_tiers_definition ON badge_tiers(badge_definition_id);

CREATE TABLE IF NOT EXISTS badge_awards (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_definition_id varchar NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id varchar REFERENCES leagues(id) ON DELETE CASCADE,
  season_id varchar REFERENCES seasons(id) ON DELETE CASCADE,
  team_id varchar REFERENCES teams(id) ON DELETE CASCADE,
  scope_key varchar(220) NOT NULL,
  tier badge_tier,
  count integer NOT NULL DEFAULT 1,
  awarded_by varchar REFERENCES users(id) ON DELETE SET NULL,
  source varchar(40) NOT NULL DEFAULT 'evaluator',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  awarded_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_badge_awards_definition_user_scope UNIQUE (badge_definition_id, user_id, scope_key)
);
CREATE INDEX IF NOT EXISTS idx_badge_awards_user ON badge_awards(user_id);
CREATE INDEX IF NOT EXISTS idx_badge_awards_scope ON badge_awards(scope_key);
CREATE INDEX IF NOT EXISTS idx_badge_awards_league_season ON badge_awards(league_id, season_id);
CREATE INDEX IF NOT EXISTS idx_badge_awards_team_season ON badge_awards(team_id, season_id);

CREATE TABLE IF NOT EXISTS badge_progress (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_definition_id varchar NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_key varchar(220) NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  count integer NOT NULL DEFAULT 0,
  earned_tiers badge_tier[] NOT NULL DEFAULT '{}'::badge_tier[],
  current_tier badge_tier,
  updated_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_badge_progress_definition_user_scope UNIQUE (badge_definition_id, user_id, scope_key)
);
CREATE INDEX IF NOT EXISTS idx_badge_progress_user ON badge_progress(user_id);

CREATE TABLE IF NOT EXISTS badge_earned_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_award_id varchar NOT NULL REFERENCES badge_awards(id) ON DELETE CASCADE,
  badge_definition_id varchar NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamp,
  acknowledged_at timestamp,
  created_at timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_badge_events_user_pending ON badge_earned_events(user_id, acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_badge_events_created ON badge_earned_events(created_at);