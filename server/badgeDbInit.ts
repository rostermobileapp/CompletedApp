import { sql } from "drizzle-orm";
import { db } from "./db";
import { ensureDefaultBadges, reconcileCalendarYearCenturyClub, reconcileCareerShutouts, reconcileHistoricalThreeStarPoints, reconcileIronMan, reconcileRookieCard, reconcileSeasonEarlyBird, reconcileSeasonHatTricks, reconcileSeasonOnFire, reconcileSeasonSubMagnet, reconcileSeasonRsvpKing } from "./badges";

// Runtime-safe DDL keeps older deployments compatible. The Drizzle schema
// remains the source of truth and drizzle-kit can still generate a migration.
export async function ensureBadgeTables() {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE badge_category AS ENUM ('nhl_trophy', 'team_badge', 'achievement');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE badge_achievement_type AS ENUM ('multiplier', 'tiered', 'onetime');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE badge_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'legend');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TYPE badge_tier ADD VALUE IF NOT EXISTS 'god_mode';
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TYPE badge_tier ADD VALUE IF NOT EXISTS 'diamond';
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE badge_trigger_type AS ENUM ('manual', 'metric', 'event');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE badge_status AS ENUM ('draft', 'published', 'archived');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  // A new enum label must be committed before it can be used in tier rows.
  await db.execute(sql`ALTER TYPE badge_tier ADD VALUE IF NOT EXISTS 'emerald'`);
  await db.execute(sql`
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
  `);
  await db.execute(sql`
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
  `);
  await db.execute(sql`
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
  `);
  await db.execute(sql`
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
  `);
  await db.execute(sql`
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
  `);
  await ensureDefaultBadges();
  await reconcileHistoricalThreeStarPoints();
  await reconcileRookieCard();
  await reconcileSeasonSubMagnet();
  await reconcileCalendarYearCenturyClub();
  await reconcileSeasonHatTricks();
  await reconcileSeasonOnFire();
  await reconcileIronMan();
  await reconcileCareerShutouts();
  await reconcileSeasonEarlyBird();
  await reconcileSeasonRsvpKing();
}