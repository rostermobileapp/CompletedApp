import { pool } from "./db";
import { DEFAULT_TRIVIA_THRESHOLDS, TRIVIA_CATEGORIES, TRIVIA_CATEGORY_LABELS, TRIVIA_TIER_NAMES, TRIVIA_UPLOADED_ART_CATEGORIES, triviaPatchImagePath } from "@shared/trivia";
import {
  migrateSupersededTriviaFallbackQuestions,
  TRIVIA_FALLBACK_QUESTIONS,
} from "./triviaFallbackSeed";

const PATCH_COLORS = ["#8B5A1A", "#909090", "#C9A84C", "#4a6a8a", "#188668", "#b9d4de", "#1a0a1a", "#F97316"];

const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS trivia_push_deliveries (
    user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE, trivia_date date NOT NULL,
    idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, lease_token uuid, lease_expires_at timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1
      CONSTRAINT trivia_push_delivery_attempts_check CHECK (attempts > 0),
    sent_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, trivia_date)
  )`,
  `CREATE TABLE IF NOT EXISTS daily_trivia (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), date date NOT NULL UNIQUE, category trivia_category NOT NULL,
    question text NOT NULL, choices jsonb NOT NULL CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4),
    correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 3), explanation text NOT NULL,
    difficulty varchar(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')), format varchar(50),
    verification_status varchar(20) NOT NULL CHECK (verification_status IN ('verified', 'fallback')),
    verification_notes text, source_basis text, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS trivia_answers (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trivia_date date NOT NULL, category trivia_category NOT NULL, chosen_index integer NOT NULL CHECK (chosen_index BETWEEN 0 AND 3),
    is_correct boolean NOT NULL, progress_awarded integer NOT NULL DEFAULT 0 CHECK (progress_awarded IN (0, 1)),
    answered_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_trivia_answers_user_date UNIQUE (user_id, trivia_date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trivia_answers_user_date ON trivia_answers(user_id, trivia_date)`,
  `CREATE INDEX IF NOT EXISTS idx_trivia_answers_category ON trivia_answers(user_id, category)`,
  `CREATE TABLE IF NOT EXISTS trivia_fallback (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), slug varchar(120) NOT NULL UNIQUE,
    category trivia_category NOT NULL, question text NOT NULL,
    choices jsonb NOT NULL CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4),
    correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 3), explanation text NOT NULL,
    difficulty varchar(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')), format varchar(50),
    verification_notes text NOT NULL, used_on date, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trivia_fallback_used_on ON trivia_fallback(used_on)`,
  `CREATE TABLE IF NOT EXISTS trivia_category_patches (
    category trivia_category PRIMARY KEY, patch_id varchar NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_trivia_category_patches_patch_id ON trivia_category_patches(patch_id)`,
  `CREATE TABLE IF NOT EXISTS trivia_tiers (
    tier integer PRIMARY KEY CHECK (tier BETWEEN 1 AND 8),
    correct_answers_required integer NOT NULL CHECK (correct_answers_required > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS trivia_generation_attempts (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), target_date date NOT NULL, attempt integer NOT NULL,
    question jsonb, verdict varchar(20) NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trivia_generation_attempts_date ON trivia_generation_attempts(target_date, attempt)`,
];

export async function ensureTriviaTables(): Promise<void> {
  await pool.query(`DO $$ BEGIN CREATE TYPE trivia_category AS ENUM
    ('nhl_history','stanley_cup','players_legends','records_stats','teams_franchises','hockey_culture','movies_media','nicknames_slang','arenas_fans');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  for (const ddl of TABLE_DDL) await pool.query(ddl);

  for (let index = 0; index < DEFAULT_TRIVIA_THRESHOLDS.length; index += 1) {
    const threshold = DEFAULT_TRIVIA_THRESHOLDS[index];
    await pool.query(
      `INSERT INTO trivia_tiers (tier, correct_answers_required) VALUES ($1, $2) ON CONFLICT (tier) DO NOTHING`,
      [index + 1, threshold],
    );
  }

  for (const category of TRIVIA_CATEGORIES) {
    const slug = `trivia_${category}`;
    const [definition] = (await pool.query(
      `INSERT INTO badge_definitions (slug, name, description, category, achievement_type, trigger_type, trigger_key,
        trigger_config, image_path, placeholder_color, status, published_at)
       VALUES ($1, $2, $3, 'achievement', 'tiered', 'metric', $4, $5, $6, '#C9A84C', 'published', now())
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [
        slug,
        `${TRIVIA_CATEGORY_LABELS[category]} Trivia`,
        `Lifetime correct answers in ${TRIVIA_CATEGORY_LABELS[category]} daily trivia. Progress never resets.`,
        `trivia:${category}`,
        JSON.stringify({ trivia: true, lifetime: true }),
        triviaPatchImagePath(category, 1),
      ],
    )).rows;
    const badge = definition ?? (await pool.query(`SELECT id FROM badge_definitions WHERE slug = $1`, [slug])).rows[0];
    if (!badge) throw new Error(`Could not initialize trivia patch family ${slug}`);
    if (TRIVIA_UPLOADED_ART_CATEGORIES.has(category)) {
      await pool.query(
        `UPDATE badge_definitions SET image_path = $2
         WHERE id = $1 AND image_path IS DISTINCT FROM $2`,
        [badge.id, triviaPatchImagePath(category, 1)],
      );
    }

    await pool.query(
      `INSERT INTO trivia_category_patches (category, patch_id) VALUES ($1, $2) ON CONFLICT (category) DO NOTHING`,
      [category, badge.id],
    );

    for (let index = 0; index < TRIVIA_TIER_NAMES.length; index += 1) {
      const tierName = TRIVIA_TIER_NAMES[index];
      const threshold = (await pool.query(
        `SELECT correct_answers_required FROM trivia_tiers WHERE tier = $1`, [index + 1],
      )).rows[0]?.correct_answers_required;
      await pool.query(
        `INSERT INTO badge_tiers (badge_definition_id, tier, threshold, image_path, color)
         VALUES ($1, $2::badge_tier, $3, $4, $5)
          ON CONFLICT (badge_definition_id, tier) DO UPDATE SET
            threshold = EXCLUDED.threshold,
            image_path = CASE WHEN $6::boolean THEN EXCLUDED.image_path ELSE badge_tiers.image_path END`,
        [
          badge.id,
          tierName,
          Number(threshold),
          triviaPatchImagePath(category, index + 1),
          PATCH_COLORS[index],
          TRIVIA_UPLOADED_ART_CATEGORIES.has(category),
        ],
      );
    }
  }

  await migrateSupersededTriviaFallbackQuestions();
  for (const fallback of TRIVIA_FALLBACK_QUESTIONS) {
    await pool.query(
      `INSERT INTO trivia_fallback (slug, category, question, choices, correct_index, explanation, difficulty, verification_notes)
       VALUES ($1, $2::trivia_category, $3, $4::jsonb, $5, $6, $7, $8) ON CONFLICT (slug) DO NOTHING`,
      [
        fallback.slug, fallback.category, fallback.question, JSON.stringify(fallback.choices),
        fallback.correctIndex, fallback.explanation, fallback.difficulty, fallback.verificationNotes,
      ],
    );
  }

  const testMode = process.env.TRIVIA_TEST_MODE !== "false";
  const allowlist = (process.env.TRIVIA_TEST_USER_IDS ?? "U00001").split(",").map((id) => id.trim()).filter(Boolean);
  console.log(`[Trivia] Test mode ${testMode ? "ON" : "OFF"}; allowed display IDs: ${testMode ? allowlist.join(", ") || "(none)" : "all authenticated users"}`);
}