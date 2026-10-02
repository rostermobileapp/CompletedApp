import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureBadgeTables } from "../badgeDbInit.js";
import { ensureTriviaTables } from "../triviaDbInit.js";
import {
  canAccessTriviaPatches,
  ensureTodayQuestion,
  getTodayTrivia,
  getTriviaPatches,
  getTriviaStats,
  isTriviaEligible,
  publishTriviaQuestion,
  resetTriviaAnswer,
  submitTriviaAnswer,
  updateTriviaCategoryMapping,
  updateTriviaTiers,
} from "../trivia.js";
import {
  categoryForTriviaDate,
  easternDateKey,
  shiftDateKey,
  TRIVIA_CATEGORY_LABELS,
  TRIVIA_TEST_DISPLAY_IDS,
  type TriviaCategory,
} from "@shared/trivia";
import { prepareTriviaTestDatabase } from "./triviaTestDatabase.js";
import { pool } from "../db.js";
import { generateTriviaForDate } from "../triviaGeneration.js";

after(async () => {
  await pool.end();
});

test("daily trivia atomically answers once, preserves lifetime patch progress, and keeps responses gated", async () => {
  const run = randomUUID().replace(/-/g, "");
  const freeUserId = `trivia_${run}_free`;
  const paidUserId = `trivia_${run}_paid`;
  const testUserId = `trivia_${run}_u00001`;
  const today = easternDateKey();
  const resetDates = [shiftDateKey(today, -18), shiftDateKey(today, -9), today];
  const wrongAnswerDate = shiftDateKey(today, -1);
  const yearBoundaryDates = ["2024-12-31", "2025-01-01"];
  const configAnswerDates = [-27, -36, -45].map((days) => shiftDateKey(today, days));
  const tomorrow = shiftDateKey(today, 1);
  const dayAfter = shiftDateKey(today, 2);
  const seasonIds = [`trivia_${run}_season_a`, `trivia_${run}_season_b`];
  let originalTiers: Array<{ tier: number; correctAnswersRequired: number }> | undefined;
  let originalCategoryPatchId: string | undefined;
  let testPatchDefinitionId: string | undefined;
  let insertedTestAccount = false;
  let databaseReady = false;
  const fallbackTestDates = ["2099-01-01", "2099-01-02", "2099-01-03", "2099-01-04"];
  const generatedTestDates = [
    ...resetDates.filter((date) => date !== today),
    wrongAnswerDate,
    ...yearBoundaryDates,
    ...configAnswerDates,
    tomorrow,
    dayAfter,
    ...fallbackTestDates,
  ];

  try {
    await prepareTriviaTestDatabase();
    databaseReady = true;
    await ensureBadgeTables();
    await ensureTriviaTables();
    for (const date of generatedTestDates) {
      await db.execute(sql`DELETE FROM trivia_generation_attempts WHERE target_date = ${date}::date`);
      await db.execute(sql`DELETE FROM daily_trivia WHERE date = ${date}::date`);
      await db.execute(sql`UPDATE trivia_fallback SET used_on = NULL WHERE used_on = ${date}::date`);
    }
    originalTiers = (await db.execute(sql`
      SELECT tier, correct_answers_required FROM trivia_tiers ORDER BY tier
    `)).rows.map((row) => ({
      tier: Number(row.tier),
      correctAnswersRequired: Number(row.correct_answers_required),
    }));
    await updateTriviaTiers(originalTiers.map((tier) => ({
      ...tier,
      correctAnswersRequired: tier.tier === 1 ? 1 : tier.tier === 2 ? 2 : tier.correctAnswersRequired,
    })));

    for (const [userId, email, role, dob, displayId] of [
      [freeUserId, `${freeUserId}@example.com`, "free_tier", "1980-01-01", null],
      [paidUserId, `${paidUserId}@example.com`, "player_pro", "1980-01-01", null],
      [testUserId, `${testUserId}@example.com`, "free_tier", "1980-01-01", TRIVIA_TEST_DISPLAY_IDS[0]],
    ] as const) {
      await db.execute(sql`
        INSERT INTO users (id, email, first_name, last_name, role, date_of_birth, display_id,
          onboarding_completed, last_updated, created_at, updated_at, fee_exempt)
        VALUES (${userId}, ${email}, 'Trivia', 'Test', ${role}, ${dob}, ${displayId},
          false, NOW(), NOW(), NOW(), false)
      `);
      if (userId === testUserId) insertedTestAccount = true;
    }

    const question = await ensureTodayQuestion(today);
    assert.equal(question.category, categoryForTriviaDate(today));
    if (question.verification_status === "fallback") {
      assert.ok((await db.execute(sql`
        SELECT id FROM trivia_generation_attempts
        WHERE target_date = ${today}::date AND verdict = 'fallback'
      `)).rows.length > 0, "on-demand fallback publication is recorded in the database review log");
    }
    const freeViewer = { id: freeUserId, role: "free_tier", dateOfBirth: "1980-01-01" };
    const beforeAnswer = await getTodayTrivia(freeUserId, freeViewer, today);
    assert.equal(beforeAnswer.answered, false);
    assert.equal("correct_index" in beforeAnswer, false);
    assert.equal("explanation" in beforeAnswer, false);
    assert.equal("feedback" in beforeAnswer, false);
    assert.equal("patch" in beforeAnswer, false, "free responses must not expose tier or patch information");
    assert.equal("patch" in (await getTriviaStats(freeUserId, today)), false);

    const simultaneous = await Promise.all(Array.from({ length: 8 }, () => submitTriviaAnswer({
      userId: freeUserId,
      viewer: freeViewer,
      chosenIndex: question.correct_index,
      triviaDate: today,
    })));
    assert.ok(simultaneous.every((result) => result.status === "answered"));
    const retries = await Promise.all(Array.from({ length: 4 }, () => submitTriviaAnswer({
      userId: freeUserId,
      viewer: freeViewer,
      chosenIndex: question.correct_index,
      triviaDate: today,
    })));
    assert.ok(retries.every((result) => result.status === "answered"));
    assert.deepEqual(await submitTriviaAnswer({
      userId: freeUserId,
      viewer: freeViewer,
      chosenIndex: (question.correct_index + 1) % 4,
      triviaDate: today,
    }), { status: "conflict" });

    const afterAnswer = await getTodayTrivia(freeUserId, freeViewer, today);
    assert.equal(afterAnswer.answered, true);
    assert.equal((afterAnswer.feedback as Record<string, unknown>).is_correct, true);
    assert.equal(typeof (afterAnswer.feedback as Record<string, unknown>).correct_index, "number");
    assert.equal("patch" in afterAnswer, false);
    const freeStats = await getTriviaStats(freeUserId, today);
    assert.equal(freeStats.total_answered, 1);
    assert.equal(freeStats.total_correct, 1);
    assert.equal(freeStats.current_streak, 1);
    assert.equal(freeStats.categories.reduce((sum, row) => sum + row.correct_count, 0), 1);
    const freePatchData = await getTriviaPatches(freeUserId, today);
    const earnedFreeCategory = freePatchData.categories.find((row) => row.category === TRIVIA_CATEGORY_LABELS[question.category]);
    assert.ok(earnedFreeCategory);
    assert.equal(earnedFreeCategory.correct_count, 1);
    assert.equal(earnedFreeCategory.current_tier, 1);
    assert.equal(canAccessTriviaPatches(freeViewer), false);
    assert.equal((await db.execute(sql`
      SELECT count(*)::int AS count FROM badge_earned_events WHERE user_id = ${freeUserId}
    `)).rows[0].count, 0, "free users retain progress without unlock celebrations");

    originalCategoryPatchId = String((await db.execute(sql`
      SELECT patch_id FROM trivia_category_patches WHERE category = ${question.category}::trivia_category
    `)).rows[0].patch_id);
    const [customDefinition] = (await db.execute(sql`
      INSERT INTO badge_definitions (slug, name, description, category, achievement_type, trigger_type,
        trigger_key, trigger_config, image_path, placeholder_color, status, published_at)
      VALUES (${`trivia_test_${run}`}, 'Trivia test remap', 'Temporary integration-test patch mapping.',
        'achievement', 'tiered', 'metric', ${`trivia:${question.category}:test`},
        ${JSON.stringify({ trivia: true, lifetime: true })}::jsonb,
        ${`/badges/trivia/${question.category}/tier-1.svg`}, '#C9A84C', 'published', now())
      RETURNING id
    `)).rows;
    testPatchDefinitionId = String(customDefinition.id);
    await updateTriviaCategoryMapping(question.category, testPatchDefinitionId);
    assert.equal((await getTriviaPatches(freeUserId, today)).categories
      .find((row) => row.category === TRIVIA_CATEGORY_LABELS[question.category])?.patch_id, testPatchDefinitionId);
    // Runtime initialization is idempotent and must not replace operator-edited
    // tier thresholds or patch mappings with seed defaults.
    await ensureTriviaTables();
    assert.equal(Number((await db.execute(sql`
      SELECT correct_answers_required FROM trivia_tiers WHERE tier = 2
    `)).rows[0].correct_answers_required), 2);
    assert.equal(String((await db.execute(sql`
      SELECT patch_id FROM trivia_category_patches WHERE category = ${question.category}::trivia_category
    `)).rows[0].patch_id), testPatchDefinitionId);
    await updateTriviaCategoryMapping(question.category, originalCategoryPatchId);
    assert.equal((await getTriviaPatches(freeUserId, today)).categories
      .find((row) => row.category === TRIVIA_CATEGORY_LABELS[question.category])?.patch_id, originalCategoryPatchId);

    const paidViewer = { id: paidUserId, role: "player_pro", dateOfBirth: "1980-01-01" };
    assert.equal(canAccessTriviaPatches(paidViewer), true);
    assert.equal(canAccessTriviaPatches({ ...paidViewer, dateOfBirth: null }), false);
    assert.equal(canAccessTriviaPatches({ ...paidViewer, dateOfBirth: "2010-01-01" }), false);
    const paidBeforeAnswer = await getTodayTrivia(paidUserId, paidViewer, today);
    assert.equal("correct_index" in paidBeforeAnswer, false);
    assert.equal("explanation" in paidBeforeAnswer, false);
    assert.equal("feedback" in paidBeforeAnswer, false);
    assert.ok(paidBeforeAnswer.patch, "eligible paid users receive the category patch in today's response");
    const paidAnswer = await submitTriviaAnswer({
      userId: paidUserId,
      viewer: paidViewer,
      chosenIndex: question.correct_index,
      triviaDate: today,
    });
    assert.equal(paidAnswer.status, "answered");
    assert.equal((paidAnswer.feedback?.is_correct), true);
    assert.ok(paidAnswer.feedback?.patch, "paid post-answer feedback may include patch progress");
    assert.equal(paidAnswer.feedback?.unlocked_tier, 1, "initial paid answer reports its newly earned tier");
    const paidRetry = await submitTriviaAnswer({
      userId: paidUserId, viewer: paidViewer, chosenIndex: question.correct_index, triviaDate: today,
    });
    assert.equal(paidRetry.feedback?.unlocked_tier, null, "idempotent retries never replay an unlock");
    const statements: string[] = [];
    const originalQuery = pool.query.bind(pool);
    pool.query = ((...args: any[]) => {
      statements.push(typeof args[0] === "string" ? args[0] : args[0].text);
      return (originalQuery as any)(...args);
    }) as typeof pool.query;
    let paidAfterAnswer: Awaited<ReturnType<typeof getTodayTrivia>>;
    try {
      paidAfterAnswer = await getTodayTrivia(paidUserId, paidViewer, today);
    } finally {
      pool.query = originalQuery as typeof pool.query;
    }
    assert.equal(paidAfterAnswer.chosen_index, question.correct_index, "reconciliation restores the saved selection");
    assert.equal(statements.some((statement) => /\b(BEGIN|INSERT|UPDATE|DELETE)\b/i.test(statement)), false,
      "loading daily feedback must not reconcile or write all nine trophy patch families");
    assert.deepEqual(paidAfterAnswer.patch, paidAfterAnswer.feedback?.patch, "daily feedback reuses its category patch");
    assert.equal(paidAfterAnswer.feedback?.unlocked_tier, null,
      "loading submitted feedback never re-announces an unlock");
    assert.equal((await db.execute(sql`
      SELECT count(*)::int AS count FROM badge_earned_events
      WHERE user_id = ${paidUserId} AND payload->>'trivia' = 'true'
    `)).rows[0].count, 1, "a paid user receives one existing-style event for the new tier");

    // Progress survives an entitlement lapse and returns on resubscription.
    await db.execute(sql`UPDATE users SET role = 'free_tier' WHERE id = ${freeUserId}`);
    assert.equal(canAccessTriviaPatches({ ...freeViewer, role: "free_tier" }), false);
    assert.equal((await getTriviaStats(freeUserId, today)).total_correct, 1);
    await db.execute(sql`UPDATE users SET role = 'player_pro' WHERE id = ${freeUserId}`);
    assert.equal(canAccessTriviaPatches({ ...freeViewer, role: "player_pro" }), true);
    assert.equal((await getTriviaPatches(freeUserId, today)).categories
      .find((row) => row.category === TRIVIA_CATEGORY_LABELS[question.category])?.current_tier, 1);
    assert.equal((await db.execute(sql`
      SELECT count(*)::int AS count FROM badge_earned_events WHERE user_id = ${freeUserId}
    `)).rows[0].count, 0, "upgrading does not replay earlier free-user celebrations");

    // Lifetime category totals continue across a calendar-year boundary and
    // are not partitioned by season rows.
    await db.execute(sql`
      INSERT INTO seasons (id) VALUES (${seasonIds[0]}), (${seasonIds[1]})
    `);
    const yearBoundaryQuestions = [];
    for (const date of yearBoundaryDates) {
      const boundaryQuestion = await ensureTodayQuestion(date);
      yearBoundaryQuestions.push(boundaryQuestion);
      const answer = await submitTriviaAnswer({
        userId: freeUserId,
        viewer: freeViewer,
        chosenIndex: boundaryQuestion.correct_index,
        triviaDate: date,
        today: date,
      });
      assert.equal(answer.status, "answered");
    }
    assert.equal((await getTriviaStats(freeUserId, "2025-01-01")).total_answered, 3);
    const yearBoundaryPatches = (await getTriviaPatches(freeUserId, "2025-01-01")).categories;
    for (const row of yearBoundaryQuestions) {
      const patch = yearBoundaryPatches.find((item) => item.category === TRIVIA_CATEGORY_LABELS[row.category]);
      assert.ok((patch?.correct_count ?? 0) >= 1);
      assert.ok((patch?.current_tier ?? 0) >= 1);
    }
    assert.deepEqual((await db.execute(sql`
      SELECT DISTINCT scope_key FROM badge_progress
      WHERE user_id = ${freeUserId} AND scope_key LIKE 'trivia:%'
      ORDER BY scope_key
    `)).rows.map((row) => row.scope_key), ["trivia:lifetime"]);

    // Two different Eastern dates reserve different fallback records under the
    // same advisory lock used by the scheduled generation worker.
    const [tomorrowQuestion, dayAfterQuestion] = await Promise.all([
      ensureTodayQuestion(tomorrow),
      ensureTodayQuestion(dayAfter),
    ]);
    assert.notEqual(tomorrowQuestion.id, dayAfterQuestion.id);
    assert.equal((await db.execute(sql`
      SELECT count(DISTINCT id)::int AS count FROM trivia_fallback
      WHERE used_on IN (${tomorrow}::date, ${dayAfter}::date)
    `)).rows[0].count, 2);

    const categoryWithNoUnusedSeed = categoryForTriviaDate(fallbackTestDates[0]);
    await db.execute(sql`
      UPDATE trivia_fallback SET used_on = '1999-01-01'::date
      WHERE category = ${categoryWithNoUnusedSeed}::trivia_category AND used_on IS NULL
    `);
    const categoryDrift = await ensureTodayQuestion(fallbackTestDates[0]);
    assert.notEqual(categoryDrift.category, categoryWithNoUnusedSeed);
    assert.match(categoryDrift.verification_notes ?? "", /No unused .* fallback remained/);
    const categoryDriftAudit = (await db.execute(sql`
      SELECT verdict, notes FROM trivia_generation_attempts
      WHERE target_date = ${fallbackTestDates[0]}::date ORDER BY created_at DESC LIMIT 1
    `)).rows[0];
    assert.equal(categoryDriftAudit.verdict, "fallback");
    assert.match(String(categoryDriftAudit.notes), /No unused .* fallback remained/);

    await db.execute(sql`UPDATE trivia_fallback SET used_on = '1999-01-01'::date`);
    const exhausted = await ensureTodayQuestion(fallbackTestDates[1]);
    assert.match(exhausted.verification_notes ?? "", /inventory was exhausted/);
    const exhaustedAudit = (await db.execute(sql`
      SELECT verdict, notes FROM trivia_generation_attempts
      WHERE target_date = ${fallbackTestDates[1]}::date ORDER BY created_at DESC LIMIT 1
    `)).rows[0];
    assert.equal(exhaustedAudit.verdict, "fallback");
    assert.match(String(exhaustedAudit.notes), /inventory was exhausted/);

    // Scheduler/manual generation and on-demand publication serialize on the
    // exact same date advisory key, so only one row wins and neither leaks a
    // fallback reservation if the other publisher wins.
    const raceDate = fallbackTestDates[2];
    const manualQuestion = {
      category: categoryForTriviaDate(raceDate),
      question: "Which word identifies this test fixture?",
      choices: ["Hockey", "Baseball", "Soccer", "Tennis"] as [string, string, string, string],
      correct_index: 0,
      explanation: "This isolated fixture uses a hockey-themed test label.",
      difficulty: "easy" as const,
      source_basis: "Integration test fixture.",
    };
    const [manualPublish, onDemandPublish] = await Promise.all([
      publishTriviaQuestion(raceDate, manualQuestion),
      ensureTodayQuestion(raceDate),
    ]);
    assert.equal(manualPublish.question.id, onDemandPublish.id);
    assert.equal((await db.execute(sql`
      SELECT count(*)::int AS count FROM daily_trivia WHERE date = ${raceDate}::date
    `)).rows[0].count, 1);

    // A model availability failure must be audited and use the same reviewed
    // continuity pool, rather than silently selecting a different model.
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    const originalFetch = globalThis.fetch;
    try {
      process.env.ANTHROPIC_API_KEY = "integration-test-not-a-secret";
      globalThis.fetch = (async () => new Response("model unavailable", { status: 404 })) as typeof fetch;
      const generated = await generateTriviaForDate(fallbackTestDates[3]);
      assert.equal(generated.fallbackUsed, true);
      assert.equal(generated.row.verificationStatus, "fallback");
      assert.ok((await db.execute(sql`
        SELECT id FROM trivia_generation_attempts
        WHERE target_date = ${fallbackTestDates[3]}::date AND verdict IN ('error', 'fallback')
      `)).rows.length >= 2, "model failure and fallback publication are persisted for review");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalApiKey;
    }

    // The maintenance reset can affect only the U00001 display-ID account,
    // counts points via progress_awarded, re-dates surviving tiers from their
    // nth correct answer, and deletes stale pending category notifications.
    const resetViewer = { id: testUserId, role: "free_tier", dateOfBirth: "1980-01-01" };
    for (const date of resetDates) {
      const resetCategory = categoryForTriviaDate(date);
      if (date !== today) {
        await publishTriviaQuestion(date, {
          category: resetCategory,
          question: `Which category label applies on ${date}?`,
          choices: ["Hockey", "Baseball", "Soccer", "Tennis"],
          correct_index: 0,
          explanation: "This is an isolated trivia lifecycle fixture.",
          difficulty: "easy",
          source_basis: "Integration test fixture.",
        });
      }
      const dailyQuestion = await ensureTodayQuestion(date);
      assert.equal(dailyQuestion.category, question.category);
      const result = await submitTriviaAnswer({
        userId: testUserId,
        viewer: resetViewer,
        chosenIndex: dailyQuestion.correct_index,
        triviaDate: date,
        today: date,
      });
      assert.equal(result.status, "answered");
    }
    const [patch] = (await db.execute(sql`
      SELECT patch_id FROM trivia_category_patches WHERE category = ${question.category}::trivia_category
    `)).rows;
    await db.execute(sql`
      UPDATE trivia_answers SET is_correct = false
      WHERE user_id = ${testUserId} AND trivia_date = ${resetDates[0]}::date
    `);
    const [tierOneAward] = (await db.execute(sql`
      SELECT id FROM badge_awards
      WHERE badge_definition_id = ${patch.patch_id} AND user_id = ${testUserId}
        AND scope_key = 'trivia:lifetime:tier:1'
    `)).rows;
    await db.execute(sql`
      INSERT INTO badge_earned_events (user_id, badge_award_id, badge_definition_id, event_type, payload)
      VALUES (${testUserId}, ${tierOneAward.id}, ${patch.patch_id}, 'badge_earned',
        ${JSON.stringify({ tier: "bronze", trivia: true })}::jsonb)
    `);
    const reset = await resetTriviaAnswer(resetDates[0]);
    assert.deepEqual(reset, { reset: true, progressReversed: 1 });
    assert.equal((await getTriviaStats(testUserId, today)).total_answered, 2);
    assert.equal((await getTriviaStats(testUserId, today)).total_correct, 2);
    const testPatch = (await getTriviaPatches(testUserId, today)).categories
      .find((row) => row.category === TRIVIA_CATEGORY_LABELS[question.category]);
    assert.equal(testPatch?.current_tier, 2);
    assert.equal(testPatch?.tiers[0].unlocked_at?.slice(0, 10), resetDates[1]);
    assert.equal(testPatch?.tiers[1].unlocked_at?.slice(0, 10), resetDates[2]);
    assert.equal((await db.execute(sql`
      SELECT count(*)::int AS count FROM badge_earned_events
      WHERE user_id = ${testUserId} AND badge_definition_id = ${patch.patch_id} AND acknowledged_at IS NULL
    `)).rows[0].count, 0, "reset must clear pending category events even when their tiers remain earned");
    assert.equal((await resetTriviaAnswer(resetDates[0])).reset, false);

    const wrongQuestionCategory = categoryForTriviaDate(wrongAnswerDate);
    await publishTriviaQuestion(wrongAnswerDate, {
      category: wrongQuestionCategory,
      question: `Which category label applies on ${wrongAnswerDate}?`,
      choices: ["Hockey", "Baseball", "Soccer", "Tennis"],
      correct_index: 0,
      explanation: "This is an isolated incorrect-answer reset fixture.",
      difficulty: "easy",
      source_basis: "Integration test fixture.",
    });
    const wrongAnswer = await submitTriviaAnswer({
      userId: testUserId,
      viewer: resetViewer,
      chosenIndex: 1,
      triviaDate: wrongAnswerDate,
      today: wrongAnswerDate,
    });
    assert.equal(wrongAnswer.status, "answered");
    assert.equal(wrongAnswer.feedback?.is_correct, false);
    assert.deepEqual(await resetTriviaAnswer(wrongAnswerDate), { reset: true, progressReversed: 0 });
    assert.equal((await getTriviaStats(testUserId, today)).total_answered, 2);
    assert.equal((await getTriviaStats(testUserId, today)).total_correct, 2);

    const originalTestMode = process.env.TRIVIA_TEST_MODE;
    const originalTestUserIds = process.env.TRIVIA_TEST_USER_IDS;
    try {
      process.env.TRIVIA_TEST_USER_IDS = TRIVIA_TEST_DISPLAY_IDS.join(",");
      process.env.TRIVIA_TEST_MODE = "true";
      assert.equal(isTriviaEligible(TRIVIA_TEST_DISPLAY_IDS[0]), true);
      assert.equal(isTriviaEligible("U99999"), false);
      process.env.TRIVIA_TEST_MODE = "false";
      assert.equal(isTriviaEligible("U99999"), true, "production mode opens play to every authenticated display ID");
      await assert.rejects(
        resetTriviaAnswer(today),
        /disabled when TRIVIA_TEST_MODE=false/,
      );
    } finally {
      if (originalTestMode === undefined) delete process.env.TRIVIA_TEST_MODE;
      else process.env.TRIVIA_TEST_MODE = originalTestMode;
      if (originalTestUserIds === undefined) delete process.env.TRIVIA_TEST_USER_IDS;
      else process.env.TRIVIA_TEST_USER_IDS = originalTestUserIds;
    }

    // Normal configuration reconciliation must never use the destructive
    // answer-reset rebuild. Preserve exact timestamps, not merely dates.
    const initialConfig = originalTiers.map((tier) => ({
      ...tier, correctAnswersRequired: tier.tier === 1 ? 1 : tier.tier === 2 ? 2 : tier.correctAnswersRequired,
    }));
    async function configAnswer(date: string) {
      await publishTriviaQuestion(date, {
        category: question.category,
        question: `Which sport is featured in the isolated fixture for ${date}?`,
        choices: ["Hockey", "Baseball", "Soccer", "Tennis"],
        correct_index: 0, explanation: "This is an isolated configuration regression fixture.",
        difficulty: "easy",
      });
      return submitTriviaAnswer({
        userId: paidUserId, viewer: paidViewer, chosenIndex: 0, triviaDate: date, today: date,
      });
    }
    assert.equal((await configAnswer(configAnswerDates[0])).feedback?.unlocked_tier, 2);
    assert.equal((await configAnswer(configAnswerDates[1])).feedback?.unlocked_tier, null);
    async function readPaidAwards() {
      return (await db.execute(sql`
        SELECT id, tier::text, awarded_at::text AS original_timestamp FROM badge_awards
        WHERE user_id = ${paidUserId} AND scope_key LIKE 'trivia:lifetime:tier:%' ORDER BY tier
      `)).rows;
    }
    const originalPaidAwards = await readPaidAwards();
    assert.equal(originalPaidAwards.length, 2);
    const beforeConfigEvents = Number((await db.execute(sql`
      SELECT count(*)::int AS count FROM badge_earned_events WHERE user_id = ${paidUserId}
    `)).rows[0].count);
    await updateTriviaTiers(initialConfig);
    assert.deepEqual(await readPaidAwards(), originalPaidAwards, "unchanged thresholds keep exact unlock timestamps");
    await updateTriviaTiers(initialConfig.map((tier) => ({
      ...tier, correctAnswersRequired: tier.tier === 1 ? 4 : tier.tier === 2 ? 6 : tier.correctAnswersRequired,
    })));
    assert.deepEqual(await readPaidAwards(), originalPaidAwards, "raising thresholds cannot revoke or re-date earned tiers");
    assert.equal((await getTriviaPatches(paidUserId, today)).categories
      .find((row) => row.category === TRIVIA_CATEGORY_LABELS[question.category])?.current_tier, 2);
    assert.equal((await configAnswer(configAnswerDates[2])).feedback?.unlocked_tier, null,
      "crossing a higher threshold for an already-earned tier is not a new unlock");
    await updateTriviaTiers(initialConfig.map((tier) => ({
      ...tier, correctAnswersRequired: tier.tier === 3 ? 3 : tier.correctAnswersRequired,
    })));
    const loweredAwards = await readPaidAwards();
    assert.deepEqual(loweredAwards.filter((award) => originalPaidAwards.some((old) => old.id === award.id)),
      originalPaidAwards, "lowering thresholds preserves all original award timestamps");
    assert.equal(loweredAwards.length, 3, "lowering a threshold silently adds newly qualifying tiers");
    await updateTriviaTiers(initialConfig);
    assert.deepEqual(await readPaidAwards(), loweredAwards, "later threshold restoration retains the new lifetime award");
    assert.equal(Number((await db.execute(sql`
      SELECT count(*)::int AS count FROM badge_earned_events WHERE user_id = ${paidUserId}
    `)).rows[0].count), beforeConfigEvents, "configuration edits and recrossings never emit celebrations");
  } finally {
    if (databaseReady) {
      if (originalTiers) await updateTriviaTiers(originalTiers);
      if (originalCategoryPatchId && testPatchDefinitionId) {
        const mappedTestCategory = (await db.execute(sql`
          SELECT category::text FROM trivia_category_patches WHERE patch_id = ${testPatchDefinitionId}
        `)).rows[0]?.category;
        if (mappedTestCategory) {
          await updateTriviaCategoryMapping(String(mappedTestCategory) as TriviaCategory, originalCategoryPatchId);
        }
      }
      if (insertedTestAccount) await db.execute(sql`DELETE FROM users WHERE id = ${testUserId}`);
      await db.execute(sql`DELETE FROM users WHERE id IN (${freeUserId}, ${paidUserId})`);
      if (testPatchDefinitionId) {
        await db.execute(sql`DELETE FROM badge_definitions WHERE id = ${testPatchDefinitionId}`);
      }
      await db.execute(sql`DELETE FROM seasons WHERE id IN (${seasonIds[0]}, ${seasonIds[1]})`);
      await db.execute(sql`UPDATE trivia_fallback SET used_on = NULL WHERE used_on = '1999-01-01'::date`);
      for (const date of generatedTestDates) {
        await db.execute(sql`UPDATE trivia_fallback SET used_on = NULL WHERE used_on = ${date}::date`);
        await db.execute(sql`DELETE FROM trivia_generation_attempts WHERE target_date = ${date}::date`);
        await db.execute(sql`DELETE FROM daily_trivia WHERE date = ${date}::date`);
      }
    }
  }
});