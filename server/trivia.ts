import { pool } from "./db";
import { hasPaidTrophyCaseAccess } from "../shared/trophyCaseAccess";
import {
  categoryForTriviaDate,
  DEFAULT_TRIVIA_THRESHOLDS,
  easternDateKey,
  isTriviaCategory,
  isTriviaDefinition,
  isTriviaDateKey,
  isTriviaUserEnabled,
  shiftDateKey,
  TRIVIA_CATEGORIES,
  TRIVIA_CATEGORY_LABELS,
  TRIVIA_TEST_DISPLAY_IDS,
  TRIVIA_TIER_NAMES,
  triviaStreaks,
  validateTriviaTiers,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaTierConfig,
  type TriviaTierName,
} from "@shared/trivia";
import { getTrophyCaseAccess } from "./badges";
import { buildTriviaPatchView, type TriviaPatchTierRow } from "@shared/triviaPatch";

export { isTriviaDefinition } from "@shared/trivia";

export type TriviaQuestionInput = {
  category: TriviaCategory;
  question: string;
  choices: readonly [string, string, string, string];
  correct_index: number;
  explanation: string;
  difficulty: TriviaDifficulty;
  format?: string | null;
  source_basis?: string | null;
};

export type TriviaPublishMetadata = {
  verificationStatus?: "verified" | "fallback";
  verificationNotes?: string | null;
  sourceBasis?: string | null;
  format?: string | null;
};

type TriviaQuestionRow = {
  id: string;
  date: string;
  category: TriviaCategory;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  difficulty: TriviaDifficulty;
  format: string | null;
  verification_status: "verified" | "fallback";
  verification_notes: string | null;
  source_basis: string | null;
};

type TriviaViewer = {
  id?: string | null;
  role?: string | null;
  isPrimaryCommissioner?: boolean | null;
  dateOfBirth?: string | null;
};

export function canAccessTriviaPatches(viewer: TriviaViewer | null | undefined, today = new Date()): boolean {
  return hasPaidTrophyCaseAccess(viewer) && getTrophyCaseAccess(viewer?.dateOfBirth, today) === "eligible";
}

export function validateTriviaQuestion(question: TriviaQuestionInput): void {
  if (!question || !isTriviaCategory(question.category)) throw new Error("Trivia question category is invalid.");
  if (typeof question.question !== "string" || !question.question.trim() || question.question.length >= 200) {
    throw new Error("Trivia question text must be non-empty and under 200 characters.");
  }
  if (!Array.isArray(question.choices) || question.choices.length !== 4 ||
    question.choices.some((choice) => typeof choice !== "string" || !choice.trim() || choice.length >= 40)) {
    throw new Error("Trivia questions require exactly four non-empty choices under 40 characters each.");
  }
  if (!Number.isInteger(question.correct_index) || question.correct_index < 0 || question.correct_index > 3) {
    throw new Error("Trivia correct_index must be an integer from zero through three.");
  }
  if (new Set(question.choices.map((choice) => choice.trim().toLocaleLowerCase())).size !== 4) {
    throw new Error("Trivia choices must be distinct.");
  }
  if (typeof question.explanation !== "string" || !question.explanation.trim() || question.explanation.length > 1000) {
    throw new Error("Trivia explanation is invalid.");
  }
  if (!["easy", "medium", "hard"].includes(question.difficulty)) {
    throw new Error("Trivia difficulty must be easy, medium, or hard.");
  }
  if (question.format && question.format.length > 50) throw new Error("Trivia format is too long.");
}

function mapQuestion(row: TriviaQuestionRow) {
  return {
    id: row.id,
    date: String(row.date).slice(0, 10),
    category: row.category,
    question: row.question,
    choices: row.choices,
    correct_index: row.correct_index,
    explanation: row.explanation,
    difficulty: row.difficulty,
    format: row.format,
    verification_status: row.verification_status,
    verification_notes: row.verification_notes,
    source_basis: row.source_basis,
  };
}

export async function publishTriviaQuestion(
  dateKey: string,
  question: TriviaQuestionInput,
  metadata: TriviaPublishMetadata = {},
): Promise<{ published: boolean; question: ReturnType<typeof mapQuestion> }> {
  if (!isTriviaDateKey(dateKey)) throw new Error(`Invalid trivia publication date: ${dateKey}`);
  validateTriviaQuestion(question);
  if (question.category !== categoryForTriviaDate(dateKey)) {
    throw new Error(`Question category must follow the configured daily rotation for ${dateKey} (${categoryForTriviaDate(dateKey)}).`);
  }
  const verificationStatus = metadata.verificationStatus ?? "verified";
  if (!["verified", "fallback"].includes(verificationStatus)) throw new Error("Invalid trivia verification status.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`daily_trivia:${dateKey}`]);
    const result = await client.query<TriviaQuestionRow>(
      `INSERT INTO daily_trivia
        (date, category, question, choices, correct_index, explanation, difficulty, format, verification_status, verification_notes, source_basis)
       VALUES ($1::date, $2::trivia_category, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (date) DO NOTHING
       RETURNING id, date::text, category::text, question, choices, correct_index, explanation, difficulty, format,
         verification_status, verification_notes, source_basis`,
      [
        dateKey, question.category, question.question, JSON.stringify(question.choices),
        question.correct_index, question.explanation, question.difficulty,
        metadata.format ?? question.format ?? null, verificationStatus,
        metadata.verificationNotes ?? null, metadata.sourceBasis ?? question.source_basis ?? null,
      ],
    );
    const stored = result.rows[0] ?? (await client.query<TriviaQuestionRow>(
      `SELECT id, date::text, category::text, question, choices, correct_index, explanation, difficulty, format,
        verification_status, verification_notes, source_basis FROM daily_trivia WHERE date = $1::date`,
      [dateKey],
    )).rows[0];
    if (!stored) throw new Error(`Unable to publish or read trivia for ${dateKey}.`);
    await client.query("COMMIT");
    return { published: result.rowCount === 1, question: mapQuestion(stored) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureTodayQuestion(dateKey = easternDateKey()): Promise<ReturnType<typeof mapQuestion>> {
  if (!isTriviaDateKey(dateKey)) throw new Error(`Invalid trivia date: ${dateKey}`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`daily_trivia:${dateKey}`]);
    const existing = (await client.query<TriviaQuestionRow>(
      `SELECT id, date::text, category::text, question, choices, correct_index, explanation, difficulty, format,
        verification_status, verification_notes, source_basis FROM daily_trivia WHERE date = $1::date`,
      [dateKey],
    )).rows[0];
    if (existing) {
      await client.query("COMMIT");
      return mapQuestion(existing);
    }

    // A single global reservation lock ensures separate dates cannot claim the
    // same fallback row during concurrent scheduler and request execution.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('trivia_fallback_reservation'))");
    const expectedCategory = categoryForTriviaDate(dateKey);
    let fallback = (await client.query(
      `SELECT id, category::text, question, choices, correct_index, explanation, difficulty, format, verification_notes
       FROM trivia_fallback WHERE used_on IS NULL AND category = $1::trivia_category
       ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
      [expectedCategory],
    )).rows[0];
    let categoryMismatch = false;
    let reused = false;
    if (!fallback) {
      fallback = (await client.query(
        `SELECT id, category::text, question, choices, correct_index, explanation, difficulty, format, verification_notes
         FROM trivia_fallback WHERE used_on IS NULL ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
      )).rows[0];
      categoryMismatch = !!fallback && fallback.category !== expectedCategory;
    }
    if (!fallback) {
      fallback = (await client.query(
        `SELECT id, category::text, question, choices, correct_index, explanation, difficulty, format, verification_notes
         FROM trivia_fallback ORDER BY used_on ASC NULLS FIRST, created_at, id LIMIT 1 FOR UPDATE`,
      )).rows[0];
      if (!fallback) throw new Error("Trivia continuity failure: fallback inventory is empty; no daily question can be published.");
      reused = true;
      categoryMismatch = fallback.category !== expectedCategory;
    }

    await client.query(`UPDATE trivia_fallback SET used_on = $2::date WHERE id = $1`, [fallback.id, dateKey]);
    const fallbackNotes = [
      String(fallback.verification_notes),
      categoryMismatch ? `No unused ${expectedCategory} fallback remained; used ${fallback.category} instead.` : "",
      reused ? "The unused fallback inventory was exhausted; this question was reused to preserve daily continuity." : "",
    ].filter(Boolean).join(" ");
    const result = await client.query<TriviaQuestionRow>(
      `INSERT INTO daily_trivia
        (date, category, question, choices, correct_index, explanation, difficulty, format, verification_status, verification_notes, source_basis)
       VALUES ($1::date, $2::trivia_category, $3, $4::jsonb, $5, $6, $7, $8, 'fallback', $9, $10)
       ON CONFLICT (date) DO NOTHING
       RETURNING id, date::text, category::text, question, choices, correct_index, explanation, difficulty, format,
         verification_status, verification_notes, source_basis`,
      [
        dateKey, fallback.category, fallback.question, JSON.stringify(fallback.choices),
        fallback.correct_index, fallback.explanation, fallback.difficulty, fallback.format, fallbackNotes, fallback.verification_notes,
      ],
    );
    const published = result.rows[0] ?? (await client.query<TriviaQuestionRow>(
      `SELECT id, date::text, category::text, question, choices, correct_index, explanation, difficulty, format,
        verification_status, verification_notes, source_basis FROM daily_trivia WHERE date = $1::date`,
      [dateKey],
    )).rows[0];
    if (!published) throw new Error(`Trivia fallback reservation failed for ${dateKey}.`);
    if (result.rowCount === 1) {
      await client.query(
        `INSERT INTO trivia_generation_attempts (target_date, attempt, question, verdict, notes)
         VALUES ($1::date, 4, $2::jsonb, 'fallback', $3)`,
        [
          dateKey,
          JSON.stringify({
            category: fallback.category,
            question: fallback.question,
            choices: fallback.choices,
            correct_index: fallback.correct_index,
          }),
          `On-demand fallback ${fallback.id} published. ${fallbackNotes}`,
        ],
      );
    }
    await client.query("COMMIT");
    if (result.rowCount !== 1) {
      // A publication won the date race; release the unused reservation.
      await pool.query(`UPDATE trivia_fallback SET used_on = NULL WHERE id = $1 AND used_on = $2::date`, [fallback.id, dateKey]);
    } else {
      console.error(`[Trivia] ALERT: fallback question published for ${dateKey}; generation should be reviewed. ${fallbackNotes}`);
    }
    return mapQuestion(published);
  } catch (error) {
    await client.query("ROLLBACK");
    const detail = error instanceof Error ? error.message : String(error);
    try {
      await pool.query(
        `INSERT INTO trivia_generation_attempts (target_date, attempt, verdict, notes)
         VALUES ($1::date, 4, 'error', $2)`,
        [dateKey, `On-demand fallback publication failed: ${detail}`],
      );
    } catch (auditError) {
      console.error("[Trivia] ALERT: could not persist fallback failure to the generation review log:", auditError);
    }
    console.error(`[Trivia] ALERT: question fallback failed for ${dateKey}: ${detail}`);
    throw error;
  } finally {
    client.release();
  }
}

export async function recordTriviaGenerationAttempt(input: {
  targetDate: string;
  attempt: number;
  question?: unknown;
  verdict: "accepted" | "rejected" | "error" | "fallback";
  notes?: string | null;
}): Promise<void> {
  if (!isTriviaDateKey(input.targetDate)) throw new Error("A valid target date is required for generation-attempt logging.");
  if (!Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 3) {
    throw new Error("Generation attempt must be a number from one through three.");
  }
  if (!["accepted", "rejected", "error", "fallback"].includes(input.verdict)) throw new Error("Invalid generation-attempt verdict.");
  await pool.query(
    `INSERT INTO trivia_generation_attempts (target_date, attempt, question, verdict, notes)
     VALUES ($1::date, $2, $3::jsonb, $4, $5)`,
    [input.targetDate, input.attempt, input.question === undefined ? null : JSON.stringify(input.question), input.verdict, input.notes ?? null],
  );
}

export async function getTriviaGenerationAttempts(targetDate: string) {
  if (!isTriviaDateKey(targetDate)) throw new Error("A valid target date is required to review generation attempts.");
  const result = await pool.query(
    `SELECT id, target_date::text, attempt, question, verdict, notes, created_at
     FROM trivia_generation_attempts WHERE target_date = $1::date ORDER BY attempt, created_at`,
    [targetDate],
  );
  return result.rows;
}

async function loadTierConfig(client?: { query: typeof pool.query }): Promise<Array<{ tier: number; threshold: number; badgeTier: TriviaTierName }>> {
  const result = await (client ?? pool).query<{ tier: number; correct_answers_required: number }>(
    `SELECT tier, correct_answers_required FROM trivia_tiers ORDER BY tier`,
  );
  const tiers = validateTriviaTiers(result.rows.map((row) => ({
    tier: Number(row.tier),
    correctAnswersRequired: Number(row.correct_answers_required),
  })));
  return tiers.map((tier) => ({ tier: tier.tier, threshold: tier.correctAnswersRequired, badgeTier: TRIVIA_TIER_NAMES[tier.tier - 1] }));
}

async function loadCategoryCount(userId: string, category: TriviaCategory, client?: { query: typeof pool.query }): Promise<number> {
  const result = await (client ?? pool).query<{ count: number }>(
    `SELECT COALESCE(sum(progress_awarded), 0)::int AS count
     FROM trivia_answers WHERE user_id = $1 AND category = $2::trivia_category`,
    [userId, category],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function syncLifetimeProgress(
  client: { query: typeof pool.query },
  userId: string,
  category: TriviaCategory,
  definitionId: string,
  count: number,
  tiers: Array<{ tier: number; threshold: number; badgeTier: TriviaTierName }>,
  announceTier?: number,
  eligibleForEvents = false,
  preserveExistingAwards = true,
) {
  const reached = tiers.filter((tier) => count >= tier.threshold);
  const existingNames = preserveExistingAwards
    ? (await client.query<{ tier: TriviaTierName }>(
        `SELECT tier::text FROM badge_awards
         WHERE badge_definition_id = $1 AND user_id = $2 AND scope_key LIKE 'trivia:lifetime:tier:%'`,
        [definitionId, userId],
      )).rows.map((row) => row.tier)
    : [];
  const earnedNames = Array.from(new Set(reached.map((tier) => tier.badgeTier).concat(existingNames)));
  const currentTier = earnedNames.length ? TRIVIA_TIER_NAMES.filter((name) => earnedNames.includes(name)).at(-1) ?? null : null;
  let newlyAnnouncedTier: number | null = null;
  await client.query(
    `INSERT INTO badge_progress (badge_definition_id, user_id, scope_key, progress, count, earned_tiers, current_tier, updated_at)
     VALUES ($1, $2, 'trivia:lifetime', $3, $3, $4::badge_tier[], $5::badge_tier, now())
     ON CONFLICT (badge_definition_id, user_id, scope_key) DO UPDATE SET
       progress = EXCLUDED.progress, count = EXCLUDED.count, earned_tiers = EXCLUDED.earned_tiers,
       current_tier = EXCLUDED.current_tier, updated_at = now()`,
    [definitionId, userId, count, earnedNames, currentTier],
  );
  for (const tier of reached) {
    const award = await client.query<{ id: string }>(
      `INSERT INTO badge_awards (badge_definition_id, user_id, scope_key, tier, count, source, metadata)
       VALUES ($1, $2, $3, $4::badge_tier, $5, 'trivia', $6::jsonb)
       ON CONFLICT (badge_definition_id, user_id, scope_key) DO NOTHING
       RETURNING id`,
      [
        definitionId, userId, `trivia:lifetime:tier:${tier.tier}`, tier.badgeTier,
        count, JSON.stringify({ category, lifetime: true, correctCount: count, threshold: tier.threshold }),
      ],
    );
    if (award.rows[0] && eligibleForEvents && tier.tier === announceTier) {
      newlyAnnouncedTier = tier.tier;
      const definition = (await client.query(
        `SELECT bd.name, bd.description, bd.image_path, bt.image_path AS tier_image_path
         FROM badge_definitions bd LEFT JOIN badge_tiers bt
           ON bt.badge_definition_id = bd.id AND bt.tier = $2::badge_tier
         WHERE bd.id = $1`,
        [definitionId, tier.badgeTier],
      )).rows[0];
      await client.query(
        `INSERT INTO badge_earned_events (user_id, badge_award_id, badge_definition_id, event_type, payload)
         VALUES ($1, $2, $3, 'badge_earned', $4::jsonb)`,
        [userId, award.rows[0].id, definitionId, JSON.stringify({
          awardId: award.rows[0].id, count, category, trivia: true, lifetime: true,
          tier: tier.badgeTier, tierNumber: tier.tier, threshold: tier.threshold,
          imagePath: definition?.tier_image_path ?? definition?.image_path ?? null,
          name: definition?.name ?? `${TRIVIA_CATEGORY_LABELS[category]} Trivia`,
          description: definition?.description ?? "",
        })],
      );
    }
  }
  return newlyAnnouncedTier;
}

async function rebuildLifetimeAwardsFromAnswers(
  client: { query: typeof pool.query },
  userId: string,
  category: TriviaCategory,
  definitionId: string,
  tiers: Array<{ tier: number; threshold: number; badgeTier: TriviaTierName }>,
  clearPendingEvents = false,
) {
  const correctDates = (await client.query<{ trivia_date: string }>(
    `SELECT trivia_date::text FROM trivia_answers
     WHERE user_id = $1 AND category = $2::trivia_category AND progress_awarded = 1
     ORDER BY trivia_date`,
    [userId, category],
  )).rows.map((row) => String(row.trivia_date).slice(0, 10));
  const count = correctDates.length;
  const reached = tiers.filter((tier) => count >= tier.threshold);
  const reachedNames = reached.map((tier) => tier.badgeTier);
  await client.query(
    `DELETE FROM badge_awards WHERE badge_definition_id = $1 AND user_id = $2
     AND scope_key LIKE 'trivia:lifetime:tier:%' AND NOT (tier = ANY($3::badge_tier[]))`,
    [definitionId, userId, reachedNames],
  );
  for (const tier of reached) {
    const awardDate = correctDates[tier.threshold - 1];
    const metadata = JSON.stringify({
      category,
      lifetime: true,
      correctCount: tier.threshold,
      threshold: tier.threshold,
    });
    await client.query(
      `INSERT INTO badge_awards
        (badge_definition_id, user_id, scope_key, tier, count, source, metadata, awarded_at)
       VALUES ($1, $2, $3, $4::badge_tier, $5, 'trivia', $6::jsonb,
         (($7::date + time '00:00') AT TIME ZONE 'America/New_York'))
       ON CONFLICT (badge_definition_id, user_id, scope_key) DO UPDATE SET
         tier = EXCLUDED.tier, count = EXCLUDED.count, metadata = EXCLUDED.metadata,
         awarded_at = EXCLUDED.awarded_at`,
      [
        definitionId, userId, `trivia:lifetime:tier:${tier.tier}`,
        tier.badgeTier, tier.threshold, metadata, awardDate,
      ],
    );
  }
  await syncLifetimeProgress(client, userId, category, definitionId, count, tiers, undefined, false, false);
  if (clearPendingEvents) {
    await client.query(
      `DELETE FROM badge_earned_events
       WHERE user_id = $1 AND badge_definition_id = $2 AND acknowledged_at IS NULL`,
      [userId, definitionId],
    );
  }
}

async function syncConfiguredBadgeTiers(
  client: { query: typeof pool.query },
  mappings: Array<{ category: TriviaCategory; patch_id: string }>,
  tiers: Array<{ tier: number; threshold: number; badgeTier: TriviaTierName }>,
) {
  for (const mapping of mappings) {
    for (const tier of tiers) {
      await client.query(
        `INSERT INTO badge_tiers (badge_definition_id, tier, threshold)
         VALUES ($1, $2::badge_tier, $3)
         ON CONFLICT (badge_definition_id, tier) DO UPDATE SET threshold = EXCLUDED.threshold`,
        [mapping.patch_id, tier.badgeTier, tier.threshold],
      );
    }
  }
}

async function resyncCategoryProgress(
  client: { query: typeof pool.query },
  mapping: { category: TriviaCategory; patch_id: string },
  tiers: Array<{ tier: number; threshold: number; badgeTier: TriviaTierName }>,
) {
  const users = await client.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM trivia_answers WHERE category = $1::trivia_category AND progress_awarded = 1`,
    [mapping.category],
  );
  for (const row of users.rows) {
    // Configuration edits are additive only. Existing tiers and their original
    // timestamps are immutable; destructive rebuilding is reserved for test reset.
    const count = await loadCategoryCount(row.user_id, mapping.category, client);
    await syncLifetimeProgress(client, row.user_id, mapping.category, mapping.patch_id, count, tiers);
  }
}

/** Persist eight strictly increasing lifetime thresholds and reconcile users silently. */
export async function updateTriviaTiers(configuration: readonly TriviaTierConfig[]): Promise<TriviaTierConfig[]> {
  const tiers = validateTriviaTiers(configuration);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('trivia_configuration'))");
    for (const tier of tiers) {
      const result = await client.query(
        `UPDATE trivia_tiers SET correct_answers_required = $2, updated_at = now() WHERE tier = $1`,
        [tier.tier, tier.correctAnswersRequired],
      );
      if (result.rowCount !== 1) throw new Error("Trivia tier configuration is not initialized; run ensureTriviaTables first.");
    }
    const mappingResult = await client.query<{ category: TriviaCategory; patch_id: string }>(
      `SELECT category::text, patch_id FROM trivia_category_patches ORDER BY category`,
    );
    const mappings = mappingResult.rows;
    const normalizedTiers = tiers.map((tier) => ({
      tier: tier.tier,
      threshold: tier.correctAnswersRequired,
      badgeTier: TRIVIA_TIER_NAMES[tier.tier - 1],
    }));
    await syncConfiguredBadgeTiers(client, mappings, normalizedTiers);
    for (const mapping of mappings) await resyncCategoryProgress(client, mapping, normalizedTiers);
    await client.query("COMMIT");
    return tiers;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Move one category to another trivia patch definition without discarding history. */
export async function updateTriviaCategoryMapping(category: TriviaCategory, patchId: string): Promise<void> {
  if (!isTriviaCategory(category)) throw new Error("Trivia category mapping uses an invalid category.");
  if (typeof patchId !== "string" || !patchId.trim()) throw new Error("A patch definition ID is required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('trivia_configuration'))");
    const definition = (await client.query<{
      id: string; slug: string; trigger_key: string | null; trigger_config: unknown;
    }>(
      `SELECT id, slug, trigger_key, trigger_config FROM badge_definitions WHERE id = $1`,
      [patchId],
    )).rows[0];
    if (!definition || !isTriviaDefinition({
      slug: definition.slug,
      triggerKey: definition.trigger_key,
      triggerConfig: definition.trigger_config,
    })) {
      throw new Error("Trivia categories can only map to an existing trivia patch definition.");
    }
    const existingCategory = (await client.query<{ category: TriviaCategory }>(
      `SELECT category::text FROM trivia_category_patches WHERE patch_id = $1 AND category <> $2::trivia_category`,
      [patchId, category],
    )).rows[0];
    if (existingCategory) {
      throw new Error(`Trivia patch definition ${patchId} is already assigned to ${existingCategory.category}.`);
    }
    const previousMapping = (await client.query<{ patch_id: string }>(
      `SELECT patch_id FROM trivia_category_patches WHERE category = $1::trivia_category`,
      [category],
    )).rows[0];
    if (previousMapping && previousMapping.patch_id !== patchId) {
      // Remapping changes presentation, not achievement history. Copy the
      // original awards without deleting the old family or replacing dates.
      await client.query(
        `INSERT INTO badge_awards
          (badge_definition_id, user_id, scope_key, tier, count, source, metadata, awarded_at)
         SELECT $2, user_id, scope_key, tier, count, source, metadata, awarded_at
         FROM badge_awards WHERE badge_definition_id = $1
           AND scope_key LIKE 'trivia:lifetime:tier:%'
         ON CONFLICT (badge_definition_id, user_id, scope_key) DO NOTHING`,
        [previousMapping.patch_id, patchId],
      );
    }
    await client.query(
      `INSERT INTO trivia_category_patches (category, patch_id, updated_at)
       VALUES ($1::trivia_category, $2, now())
       ON CONFLICT (category) DO UPDATE SET patch_id = EXCLUDED.patch_id, updated_at = now()`,
      [category, patchId],
    );
    const tierRows = await client.query<{ tier: number; correct_answers_required: number }>(
      `SELECT tier, correct_answers_required FROM trivia_tiers ORDER BY tier`,
    );
    const tiers = validateTriviaTiers(tierRows.rows.map((row) => ({
      tier: Number(row.tier),
      correctAnswersRequired: Number(row.correct_answers_required),
    }))).map((tier) => ({
      tier: tier.tier,
      threshold: tier.correctAnswersRequired,
      badgeTier: TRIVIA_TIER_NAMES[tier.tier - 1],
    }));
    const mapping = { category, patch_id: patchId };
    await syncConfiguredBadgeTiers(client, [mapping], tiers);
    await resyncCategoryProgress(client, mapping, tiers);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getTriviaStats(userId: string, today = easternDateKey()) {
  const [aggregate, correctDates, categoryRows] = await Promise.all([
    pool.query<{ total_answered: number; total_correct: number }>(
      `SELECT count(*)::int AS total_answered, count(*) FILTER (WHERE is_correct)::int AS total_correct
       FROM trivia_answers WHERE user_id = $1`, [userId],
    ),
    pool.query<{ trivia_date: string; is_correct: boolean }>(
      `SELECT trivia_date::text, is_correct FROM trivia_answers WHERE user_id = $1 ORDER BY trivia_date`,
      [userId],
    ),
    pool.query<{ category: TriviaCategory; count: number }>(
      `SELECT category::text, COALESCE(sum(progress_awarded), 0)::int AS count FROM trivia_answers
       WHERE user_id = $1 GROUP BY category`, [userId],
    ),
  ]);
  const totalAnswered = Number(aggregate.rows[0]?.total_answered ?? 0);
  const totalCorrect = Number(aggregate.rows[0]?.total_correct ?? 0);
  const normalizedDates = correctDates.rows.map((row) => ({
    date: String(row.trivia_date).slice(0, 10),
    isCorrect: row.is_correct,
  }));
  const answerToday = normalizedDates.find((row) => row.date === today);
  const streak = triviaStreaks(
    normalizedDates.filter((row) => row.isCorrect).map((row) => row.date),
    today,
    answerToday?.isCorrect,
  );
  const correctByCategory = new Map(categoryRows.rows.map((row) => [row.category, Number(row.count)]));
  return {
    total_answered: totalAnswered,
    total_correct: totalCorrect,
    accuracy: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 10000) / 100 : 0,
    current_streak: streak.current,
    best_streak: streak.best,
    categories: TRIVIA_CATEGORIES.map((category) => ({
      category: TRIVIA_CATEGORY_LABELS[category],
      correct_count: correctByCategory.get(category) ?? 0,
    })),
  };
}

async function ensureUserProgress(userId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('trivia_configuration'))");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`trivia_user:${userId}`]);
    const tiers = await loadTierConfig(client);
    const mapping = await client.query<{ category: TriviaCategory; patch_id: string }>(
      `SELECT category::text, patch_id FROM trivia_category_patches ORDER BY category`,
    );
    await syncConfiguredBadgeTiers(client, mapping.rows, tiers);
    for (const row of mapping.rows) {
      const count = await loadCategoryCount(userId, row.category, client);
      await syncLifetimeProgress(client, userId, row.category, row.patch_id, count, tiers);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getTriviaPatches(userId: string, today = easternDateKey()) {
  await ensureUserProgress(userId);
  const [tiers, mapped, awards, artRows, stats] = await Promise.all([
    loadTierConfig(),
    pool.query(
      `SELECT c.category::text, c.patch_id, d.name, d.image_path, d.description
       FROM trivia_category_patches c JOIN badge_definitions d ON d.id = c.patch_id
       ORDER BY c.category`,
    ),
    pool.query(
      `SELECT badge_definition_id, tier::text AS badge_tier, awarded_at
       FROM badge_awards WHERE user_id = $1 AND scope_key LIKE 'trivia:lifetime:tier:%'`,
      [userId],
    ),
    pool.query(
      `SELECT c.category::text, bt.tier::text AS badge_tier, bt.image_path
       FROM trivia_category_patches c JOIN badge_tiers bt ON bt.badge_definition_id = c.patch_id`,
    ),
    getTriviaStats(userId, today),
  ]);
  const dates = new Map(awards.rows.map((award) => [`${award.badge_definition_id}:${award.badge_tier}`, new Date(award.awarded_at).toISOString()]));
  const images = new Map(artRows.rows.map((art) => [`${art.category}:${art.badge_tier}`, art.image_path as string | null]));
  const categories = await Promise.all(mapped.rows.map(async (row) => {
    const category = row.category as TriviaCategory;
    const correctCount = await loadCategoryCount(userId, category);
    const tierStates = tiers.map((tier) => {
      const unlockDate = dates.get(`${row.patch_id}:${tier.badgeTier}`) ?? null;
      return {
        tier: tier.tier,
        threshold: tier.threshold,
        unlocked_at: unlockDate,
        imagePath: images.get(`${category}:${tier.badgeTier}`) ?? `/badges/trivia/${category}/tier-${tier.tier}.svg`,
        earned: correctCount >= tier.threshold || unlockDate !== null,
      };
    });
    const reached = tierStates.filter((tier) => tier.earned);
    const currentTier = reached.at(-1)?.tier ?? 0;
    const next = tierStates.find((tier) => !tier.earned);
    return {
      category: TRIVIA_CATEGORY_LABELS[category],
      patch_id: row.patch_id,
      name: row.name,
      description: row.description,
      imagePath: images.get(`${category}:${TRIVIA_TIER_NAMES[currentTier > 0 ? currentTier - 1 : 0]}`)
        ?? `/badges/trivia/${category}/tier-${currentTier || 1}.svg`,
      correct_count: correctCount,
      current_tier: currentTier,
      next_threshold: next?.threshold ?? null,
      complete: !next,
      tiers: tierStates.map(({ earned: _earned, ...tier }) => tier),
    };
  }));
  return { categories, stats };
}

// Feedback must not invoke getTriviaPatches: that reconciles all nine families
// and is intentionally reserved for opening the Trophy Case.
async function getTriviaCategoryPatch(userId: string, category: TriviaCategory) {
  const result = await pool.query<TriviaPatchTierRow & {
    patch_id: string; name: string; description: string; correct_count: number;
  }>(
    `SELECT t.tier, t.correct_answers_required, c.patch_id, d.name, d.description,
       bt.image_path, a.awarded_at, counts.correct_count
     FROM trivia_category_patches c
     JOIN badge_definitions d ON d.id = c.patch_id
     CROSS JOIN trivia_tiers t
     CROSS JOIN LATERAL (
       SELECT COALESCE(sum(progress_awarded), 0)::int AS correct_count
       FROM trivia_answers WHERE user_id = $1 AND category = c.category
     ) counts
     LEFT JOIN badge_tiers bt ON bt.badge_definition_id = c.patch_id
       AND bt.tier::text = ($3::text[])[t.tier]
     LEFT JOIN badge_awards a ON a.badge_definition_id = c.patch_id
       AND a.user_id = $1 AND a.scope_key = 'trivia:lifetime:tier:' || t.tier::text
     WHERE c.category = $2::trivia_category ORDER BY t.tier`,
    [userId, category, [...TRIVIA_TIER_NAMES]],
  );
  const first = result.rows[0];
  if (!first) throw new Error(`No trivia patch mapping is configured for ${category}.`);
  return buildTriviaPatchView({
    category, patchId: first.patch_id, name: first.name, description: first.description,
    correctCount: Number(first.correct_count), tiers: result.rows,
  });
}

async function answerFeedback(userId: string, dateKey: string, answerRow?: {
  category: TriviaCategory;
  chosen_index: number;
  is_correct: boolean;
}, includePatch = false, unlockedTier: number | null = null, knownQuestion?: TriviaQuestionRow) {
  if (!answerRow) return null;
  const question = knownQuestion ?? (await pool.query<TriviaQuestionRow>(
    `SELECT id, date::text, category::text, question, choices, correct_index, explanation, difficulty, format,
      verification_status, verification_notes, source_basis FROM daily_trivia WHERE date = $1::date`,
    [dateKey],
  )).rows[0];
  if (!question) return null;
  const [stats, patch] = await Promise.all([
    getTriviaStats(userId, dateKey),
    includePatch ? getTriviaCategoryPatch(userId, answerRow.category) : Promise.resolve(null),
  ]);
  const categoryCount = stats.categories.find((item) =>
    item.category === TRIVIA_CATEGORY_LABELS[answerRow.category])?.correct_count ?? 0;
  const result: Record<string, unknown> = {
    is_correct: answerRow.is_correct,
    correct_index: question.correct_index,
    explanation: question.explanation,
    streak: stats.current_streak,
    category: TRIVIA_CATEGORY_LABELS[answerRow.category],
    correct_count: categoryCount,
  };
  if (includePatch) {
    result.patch = patch;
    result.unlocked_tier = unlockedTier;
  }
  return result;
}

export async function getTodayTrivia(userId: string, viewer?: TriviaViewer, today = easternDateKey()) {
  const question = await ensureTodayQuestion(today);
  const answer = (await pool.query<{ category: TriviaCategory; chosen_index: number; is_correct: boolean }>(
    `SELECT category::text, chosen_index, is_correct FROM trivia_answers WHERE user_id = $1 AND trivia_date = $2::date`,
    [userId, today],
  )).rows[0];
  const paidAccess = canAccessTriviaPatches(viewer);
  const response: Record<string, unknown> = {
    date: today,
    category: TRIVIA_CATEGORY_LABELS[question.category],
    question: question.question,
    choices: question.choices,
    difficulty: question.difficulty,
    answered: !!answer,
    // Deliberately delivered to eligible clients for immediate on-device
    // feedback. Persistence and patch progress still use server-side grading.
    correct_index: question.correct_index,
    explanation: question.explanation,
  };
  if (answer) {
    response.chosen_index = answer.chosen_index;
    response.feedback = await answerFeedback(userId, today, answer, paidAccess, null, question);
  }
  if (paidAccess) {
    response.patch = answer
      ? (response.feedback as Record<string, unknown> | null)?.patch ?? null
      : await getTriviaCategoryPatch(userId, question.category);
  }
  return response;
}

export async function submitTriviaAnswer(input: {
  userId: string;
  viewer?: TriviaViewer;
  chosenIndex: number;
  triviaDate: string;
  today?: string;
}): Promise<{ status: "answered" | "conflict" | "stale"; feedback?: Record<string, unknown> }> {
  const today = input.today ?? easternDateKey();
  if (!Number.isInteger(input.chosenIndex) || input.chosenIndex < 0 || input.chosenIndex > 3) {
    throw new Error("chosen_index must be an integer from zero through three.");
  }
  if (!isTriviaDateKey(input.triviaDate)) throw new Error("trivia_date must be a valid Eastern calendar date.");
  if (input.triviaDate !== today) return { status: "stale" };
  const question = await ensureTodayQuestion(today);
  const client = await pool.connect();
  let eventUserId: string | null = null;
  let newlyUnlockedTier: number | null = null;
  let responseStatus: "answered" | "conflict" = "answered";
  let persistedAnswer: { category: TriviaCategory; chosen_index: number; is_correct: boolean } | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('trivia_configuration'))");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`trivia_user:${input.userId}`]);
    if (input.today === undefined && easternDateKey() !== today) {
      await client.query("ROLLBACK");
      return { status: "stale" };
    }
    const existing = (await client.query<{
      category: TriviaCategory; chosen_index: number; is_correct: boolean;
    }>(
      `SELECT category::text, chosen_index, is_correct FROM trivia_answers WHERE user_id = $1 AND trivia_date = $2::date`,
      [input.userId, today],
    )).rows[0];
    if (existing) {
      responseStatus = existing.chosen_index === input.chosenIndex ? "answered" : "conflict";
      persistedAnswer = existing;
      await client.query("COMMIT");
    } else {
      const correct = input.chosenIndex === question.correct_index;
      const inserted = await client.query(
        `INSERT INTO trivia_answers (user_id, trivia_date, category, chosen_index, is_correct, progress_awarded)
         VALUES ($1, $2::date, $3::trivia_category, $4, $5, $6)
         ON CONFLICT (user_id, trivia_date) DO NOTHING
         RETURNING id`,
        [input.userId, today, question.category, input.chosenIndex, correct, correct ? 1 : 0],
      );
      if (!inserted.rows[0]) {
        const concurrent = (await client.query<{
          category: TriviaCategory; chosen_index: number; is_correct: boolean;
        }>(
          `SELECT category::text, chosen_index, is_correct FROM trivia_answers WHERE user_id = $1 AND trivia_date = $2::date`,
          [input.userId, today],
        )).rows[0];
        if (!concurrent) throw new Error("Trivia answer was not saved; please try again.");
        persistedAnswer = concurrent;
        responseStatus = concurrent.chosen_index === input.chosenIndex ? "answered" : "conflict";
        await client.query("COMMIT");
      } else {
        persistedAnswer = { category: question.category, chosen_index: input.chosenIndex, is_correct: correct };
        if (correct) {
          const mapping = (await client.query<{ patch_id: string }>(
            `SELECT patch_id FROM trivia_category_patches WHERE category = $1::trivia_category`, [question.category],
          )).rows[0];
          if (!mapping) throw new Error(`No trivia patch mapping is configured for ${question.category}.`);
          const previousCount = await loadCategoryCount(input.userId, question.category, client) - 1;
          const newCount = previousCount + 1;
          const tiers = await loadTierConfig(client);
          const crossing = tiers.find((tier) => previousCount < tier.threshold && newCount >= tier.threshold);
          const entitled = canAccessTriviaPatches(input.viewer);
          newlyUnlockedTier = await syncLifetimeProgress(
            client, input.userId, question.category, mapping.patch_id, newCount, tiers,
            crossing?.tier, entitled,
          );
          if (newlyUnlockedTier !== null) eventUserId = input.userId;
        }
        await client.query("COMMIT");
      }
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (eventUserId) {
    try {
      const { broadcastToUser } = await import("./routes");
      broadcastToUser(eventUserId, { type: "badge_events_update" });
    } catch (error) {
      console.error("[Trivia] Failed to notify the client about a new trivia patch tier:", error);
    }
  }
  if (responseStatus === "conflict") return { status: "conflict" };
  return {
    status: "answered",
    feedback: (await answerFeedback(input.userId, today, persistedAnswer, canAccessTriviaPatches(input.viewer), newlyUnlockedTier, question)) ?? undefined,
  };
}

export async function resetTriviaAnswer(dateKey: string): Promise<{ reset: boolean; progressReversed: number }> {
  if (process.env.TRIVIA_TEST_MODE === "false") {
    throw new Error("Trivia answer reset is disabled when TRIVIA_TEST_MODE=false.");
  }
  if (!isTriviaDateKey(dateKey)) throw new Error("A valid trivia date is required for reset.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('trivia_configuration'))");
    const testUser = (await client.query<{ id: string }>(
      `SELECT id FROM users WHERE display_id = $1`, [TRIVIA_TEST_DISPLAY_IDS[0]],
    )).rows[0];
    if (!testUser) throw new Error("The U00001 test account was not found.");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`trivia_user:${testUser.id}`]);
    const answer = (await client.query<{ category: TriviaCategory; progress_awarded: number }>(
      `DELETE FROM trivia_answers WHERE user_id = $1 AND trivia_date = $2::date
       RETURNING category::text, progress_awarded`,
      [testUser.id, dateKey],
    )).rows[0];
    if (!answer) {
      await client.query("COMMIT");
      return { reset: false, progressReversed: 0 };
    }
    let progressReversed = 0;
    if (Number(answer.progress_awarded) === 1) progressReversed = 1;
    const mapping = (await client.query<{ patch_id: string }>(
      `SELECT patch_id FROM trivia_category_patches WHERE category = $1::trivia_category`, [answer.category],
    )).rows[0];
    if (mapping) {
      const tiers = await loadTierConfig(client);
      await rebuildLifetimeAwardsFromAnswers(
        client, testUser.id, answer.category, mapping.patch_id, tiers, true,
      );
    }
    await client.query("COMMIT");
    console.log(`[Trivia] Reset U00001 answer for ${dateKey}; reversed ${progressReversed} category point(s).`);
    return { reset: true, progressReversed };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function isTriviaEligible(displayId: string | null | undefined): boolean {
  return isTriviaUserEnabled(displayId);
}

export function nextTriviaDate(dateKey: string): string {
  return shiftDateKey(dateKey, 1);
}