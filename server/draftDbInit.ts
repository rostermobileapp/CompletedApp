/**
 * Draft system database column migrations.
 * Adds columns that cannot be applied via interactive drizzle-kit push.
 * Runs once at server startup before routes are registered.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

export async function initDraftDb(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE drafts
        ADD COLUMN IF NOT EXISTS resolved_auto_pick_schedule jsonb,
        ADD COLUMN IF NOT EXISTS flagged_auto_pick_slots jsonb DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS flagged_picks jsonb DEFAULT '[]'::jsonb
    `);
    await db.execute(sql`
      ALTER TABLE draft_keepers
        ADD COLUMN IF NOT EXISTS rank varchar
    `);
    await db.execute(sql`
      ALTER TABLE draft_buddy_pairs
        ADD COLUMN IF NOT EXISTS ranks jsonb
    `);
    await db.execute(sql`
      ALTER TABLE draft_picks
        ADD COLUMN IF NOT EXISTS placeholder_player_id varchar
          REFERENCES placeholder_players(id) ON DELETE CASCADE
    `);
    console.log("[Draft] Auto-pick schedule columns ensured");
  } catch (err) {
    console.error("[Draft] Failed to init auto-pick schedule columns:", err);
  }
}
