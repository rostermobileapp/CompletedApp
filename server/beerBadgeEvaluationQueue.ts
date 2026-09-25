import { sql } from "drizzle-orm";
import { db } from "./db";

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 25;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

export async function ensureBeerBadgeEvaluationQueue() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS beer_badge_evaluation_queue (
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      season_id varchar NOT NULL DEFAULT '',
      version integer NOT NULL DEFAULT 1,
      processed_version integer NOT NULL DEFAULT 0,
      claimed_version integer,
      claimed_at timestamp,
      requested_at timestamp NOT NULL DEFAULT NOW(),
      available_at timestamp NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, season_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_beer_badge_evaluation_queue_pending
    ON beer_badge_evaluation_queue(available_at, requested_at)
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION enqueue_beer_badge_evaluation_year(p_user_id varchar, p_year integer)
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO beer_badge_evaluation_queue (user_id, season_id)
      VALUES (p_user_id, 'year:' || p_year::text)
      ON CONFLICT (user_id, season_id) DO UPDATE
      SET version = beer_badge_evaluation_queue.version + 1,
          requested_at = NOW(),
          available_at = NOW();
    END;
    $$
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION enqueue_beer_badge_evaluation(p_user_id varchar, p_game_id varchar)
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE game_year integer;
    BEGIN
      SELECT EXTRACT(YEAR FROM g.scheduled_at)::int INTO game_year
      FROM games g WHERE g.id = p_game_id;
      IF game_year IS NOT NULL THEN
        PERFORM enqueue_beer_badge_evaluation_year(p_user_id, game_year);
      END IF;
    END;
    $$
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION queue_beer_badge_evaluation_for_count_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'UPDATE'
        AND OLD.count IS NOT DISTINCT FROM NEW.count
        AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
        AND OLD.game_id IS NOT DISTINCT FROM NEW.game_id THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'DELETE'
        OR (TG_OP = 'UPDATE'
          AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.game_id IS DISTINCT FROM NEW.game_id)) THEN
        PERFORM enqueue_beer_badge_evaluation(OLD.user_id, OLD.game_id);
      END IF;

      IF TG_OP <> 'DELETE' THEN
        PERFORM enqueue_beer_badge_evaluation(NEW.user_id, NEW.game_id);
        RETURN NEW;
      END IF;

      RETURN OLD;
    END;
    $$
  `);
  await db.execute(sql`
    DROP TRIGGER IF EXISTS game_beer_counts_badge_evaluation ON game_beer_counts
  `);
  await db.execute(sql`
    CREATE TRIGGER game_beer_counts_badge_evaluation
    AFTER INSERT OR UPDATE OR DELETE ON game_beer_counts
    FOR EACH ROW
    EXECUTE FUNCTION queue_beer_badge_evaluation_for_count_change()
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION queue_beer_badge_evaluation_for_game_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE affected_user record;
    BEGIN
      IF TG_OP = 'UPDATE'
        AND EXTRACT(YEAR FROM OLD.scheduled_at) = EXTRACT(YEAR FROM NEW.scheduled_at) THEN
        RETURN NEW;
      END IF;
      -- BEFORE DELETE retains the game and its beer rows, even if the
      -- game_beer_counts rows subsequently disappear through cascade.
      FOR affected_user IN
        SELECT DISTINCT user_id FROM game_beer_counts WHERE game_id = OLD.id
      LOOP
        PERFORM enqueue_beer_badge_evaluation_year(
          affected_user.user_id, EXTRACT(YEAR FROM OLD.scheduled_at)::int);
        IF TG_OP = 'UPDATE' THEN
          PERFORM enqueue_beer_badge_evaluation_year(
            affected_user.user_id, EXTRACT(YEAR FROM NEW.scheduled_at)::int);
        END IF;
      END LOOP;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.execute(sql`DROP TRIGGER IF EXISTS games_beer_badge_evaluation ON games`);
  await db.execute(sql`
    CREATE TRIGGER games_beer_badge_evaluation
    BEFORE UPDATE OF scheduled_at OR DELETE ON games
    FOR EACH ROW EXECUTE FUNCTION queue_beer_badge_evaluation_for_game_change()
  `);
  console.log("[Badges] Beer count changes now queue badge evaluation");
}

export async function processPendingBeerBadgeEvaluations(forUserId?: string) {
  if (processing) return;
  processing = true;

  try {
    const result = await db.execute(sql`
      WITH pending AS (
        SELECT user_id, season_id, version
        FROM beer_badge_evaluation_queue
        WHERE version > processed_version
          ${forUserId ? sql`AND user_id = ${forUserId}` : sql``}
          ${forUserId ? sql`` : sql`AND requested_at <= NOW() - INTERVAL '1 second'
          AND available_at <= NOW()`}
          AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '2 minutes')
        ORDER BY requested_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH_SIZE}
      )
      UPDATE beer_badge_evaluation_queue AS queue
      SET claimed_version = pending.version,
          claimed_at = NOW()
      FROM pending
      WHERE queue.user_id = pending.user_id
        AND queue.season_id = pending.season_id
      RETURNING queue.user_id, queue.season_id, queue.claimed_version
    `);
    const jobs = (result.rows ?? []) as Array<{
      user_id: string;
      season_id: string;
      claimed_version: number | string;
    }>;
    if (!jobs.length) return;

    const { evaluateBadgesForUser } = await import("./badges");
    for (const job of jobs) {
      const version = Number(job.claimed_version);
      try {
        const annualKey = /^year:(\d{4})$/.exec(job.season_id);
        const years = annualKey
          ? [Number(annualKey[1])]
          : (await db.execute(sql`
              SELECT DISTINCT EXTRACT(YEAR FROM scheduled_at)::int AS year
              FROM games
              WHERE ${job.season_id === "" ? sql`season_id IS NULL` : sql`season_id = ${job.season_id}`}
            `)).rows.map((row) => Number(row.year));
        for (const year of years) {
          await evaluateBadgesForUser(job.user_id, { year }, "calendar_year_beers");
        }
        await db.execute(sql`
          UPDATE beer_badge_evaluation_queue
          SET processed_version = GREATEST(processed_version, ${version}),
              claimed_version = NULL,
              claimed_at = NULL,
              available_at = NOW()
          WHERE user_id = ${job.user_id}
            AND season_id = ${job.season_id}
            AND claimed_version = ${version}
        `);
      } catch (error) {
        await db.execute(sql`
          UPDATE beer_badge_evaluation_queue
          SET claimed_version = NULL,
              claimed_at = NULL,
              available_at = NOW() + INTERVAL '10 seconds'
          WHERE user_id = ${job.user_id}
            AND season_id = ${job.season_id}
            AND claimed_version = ${version}
        `);
        console.error(`[Badges] Queued beer evaluation failed for user ${job.user_id}:`, error);
      }
    }
  } catch (error) {
    console.error("[Badges] Failed to process beer evaluation queue:", error);
  } finally {
    processing = false;
  }
}

export function startBeerBadgeEvaluationWorker() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void processPendingBeerBadgeEvaluations();
  }, POLL_INTERVAL_MS);
  void processPendingBeerBadgeEvaluations();
}