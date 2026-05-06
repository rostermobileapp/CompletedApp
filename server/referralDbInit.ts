/**
 * Referral program database initialization.
 * Creates tables if they do not already exist.
 * This runs once at server startup, before routes are registered.
 *
 * The project uses drizzle-kit push for schema management. This file serves
 * as a safety net so the referral tables are always present even when
 * drizzle-kit push cannot be run interactively (e.g. in CI or when other
 * tables in the schema trigger interactive prompts unrelated to this feature).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

export async function initReferralDb(): Promise<void> {
  try {
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_partner_status') THEN
          CREATE TYPE referral_partner_status AS ENUM ('pending', 'approved', 'rejected');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_platform') THEN
          CREATE TYPE referral_platform AS ENUM ('ios', 'android', 'web');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_conversion_status') THEN
          CREATE TYPE referral_conversion_status AS ENUM ('active', 'cancelled', 'refunded');
        END IF;
      END $$;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_partners (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        org_name VARCHAR(255) NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        org_type VARCHAR(100),
        hockey_affiliation TEXT,
        proof_document_path TEXT,
        status referral_partner_status NOT NULL DEFAULT 'pending',
        referral_code VARCHAR(20) UNIQUE,
        payout_rate DECIMAL(5,4) NOT NULL DEFAULT 0.10,
        admin_notes TEXT,
        approved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_referral_partners_status ON referral_partners(status);
      CREATE INDEX IF NOT EXISTS idx_referral_partners_code ON referral_partners(referral_code);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_magic_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id VARCHAR NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_referral_magic_links_token ON referral_magic_links(token);
      CREATE INDEX IF NOT EXISTS idx_referral_magic_links_partner ON referral_magic_links(partner_id);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_conversions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id VARCHAR NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
        referral_code VARCHAR(20) NOT NULL,
        user_id VARCHAR,
        revenuecat_event_id VARCHAR(255) UNIQUE,
        tier VARCHAR(100),
        platform referral_platform,
        gross_price_cents INTEGER NOT NULL DEFAULT 0,
        status referral_conversion_status NOT NULL DEFAULT 'active',
        converted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_referral_conversions_partner ON referral_conversions(partner_id);
      CREATE INDEX IF NOT EXISTS idx_referral_conversions_status ON referral_conversions(status);
      CREATE INDEX IF NOT EXISTS idx_referral_conversions_converted_at ON referral_conversions(converted_at);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_payouts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id VARCHAR NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
        quarter VARCHAR(10) NOT NULL,
        amount_cents INTEGER NOT NULL,
        method VARCHAR(100),
        reference VARCHAR(255),
        notes TEXT,
        paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_referral_payouts_partner ON referral_payouts(partner_id);
      CREATE INDEX IF NOT EXISTS idx_referral_payouts_quarter ON referral_payouts(quarter);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_user_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        referral_partner_id VARCHAR NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL,
        linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
        is_paid BOOLEAN NOT NULL DEFAULT FALSE,
        paid_tier VARCHAR(50),
        paid_at TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_referral_user_links_partner ON referral_user_links(referral_partner_id);
      CREATE INDEX IF NOT EXISTS idx_referral_user_links_user ON referral_user_links(user_id);
    `);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_referral_user_links_partner_user'
        ) THEN
          ALTER TABLE referral_user_links
            ADD CONSTRAINT uq_referral_user_links_partner_user UNIQUE (referral_partner_id, user_id);
        END IF;
      END $$;
    `);

    // Add referral attribution columns to users if missing
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20),
        ADD COLUMN IF NOT EXISTS referral_partner_id VARCHAR,
        ADD COLUMN IF NOT EXISTS referral_source_other TEXT;
    `);

    // Add FK constraint from users.referral_partner_id → referral_partners.id if missing
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_users_referral_partner_id'
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT fk_users_referral_partner_id
            FOREIGN KEY (referral_partner_id)
            REFERENCES referral_partners(id)
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Add conversion_type column if missing (tracks initial_purchase / renewal / claim)
    await db.execute(sql`
      ALTER TABLE referral_conversions
        ADD COLUMN IF NOT EXISTS conversion_type VARCHAR(20) DEFAULT 'initial_purchase';
    `);

    console.log('[Init] Referral program tables ensured');
  } catch (err) {
    console.error('[Init] Failed to ensure referral program tables:', err);
  }
}
