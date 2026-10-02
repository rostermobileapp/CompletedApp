import {
  isTriviaCategory,
  isTriviaDateKey,
  TRIVIA_TEST_DISPLAY_IDS,
} from "@shared/trivia";
import {
  generateTriviaForDate,
  preGenerateTriviaDays,
  tomorrowEasternDateKey,
  triviaGenerationConfiguration,
} from "../server/triviaGeneration";
import {
  resetTriviaAnswer,
  updateTriviaCategoryMapping,
  updateTriviaTiers,
} from "../server/trivia";
import { ensureTriviaTables } from "../server/triviaDbInit";
import { seedTriviaFallbackQuestions } from "../server/triviaFallbackSeed";
import { pool } from "../server/db";

function usage(): string {
  return [
    "Daily trivia operations",
    "  npx tsx scripts/trivia.ts seed-fallbacks",
    "  npx tsx scripts/trivia.ts generate [YYYY-MM-DD]",
    "  npx tsx scripts/trivia.ts review [YYYY-MM-DD] [days=7]",
    "  npx tsx scripts/trivia.ts reset U00001 YYYY-MM-DD",
    "  npx tsx scripts/trivia.ts set-tiers <8 increasing positive thresholds>",
    "  npx tsx scripts/trivia.ts set-mapping <category> <trivia-patch-definition-id>",
  ].join("\n");
}

function printQuestion(date: string, result: Awaited<ReturnType<typeof generateTriviaForDate>>) {
  console.log(JSON.stringify({
    date,
    created: result.created,
    verification_status: result.row.verificationStatus,
    category: result.row.category,
    format: result.row.format,
    question: result.row.question,
    choices: result.row.choices,
    correct_index: result.row.correctIndex,
    explanation: result.row.explanation,
    verification_notes: result.row.verificationNotes,
    source_basis: result.row.sourceBasis,
  }, null, 2));
}

async function ensureTriviaDatabase(): Promise<void> {
  const result = await pool.query<{ badge_tables_ready: boolean }>(`
    SELECT to_regclass('public.badge_definitions') IS NOT NULL
      AND to_regclass('public.badge_tiers') IS NOT NULL AS badge_tables_ready
  `);
  if (!result.rows[0]?.badge_tables_ready) {
    // Existing databases are initialized by the Roster server. Only a truly
    // new database needs the broader badge bootstrap before trivia tables.
    const { ensureBadgeTables } = await import("../server/badgeDbInit");
    await ensureBadgeTables();
  }
  await ensureTriviaTables();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }

  console.log(`[Trivia] Operations use model ${triviaGenerationConfiguration().model}; timezone ${triviaGenerationConfiguration().timezone}.`);
  await ensureTriviaDatabase();

  if (command === "seed-fallbacks") {
    const inserted = await seedTriviaFallbackQuestions();
    console.log(`[Trivia] Fallback seed pass complete; ${inserted} additional verified question(s) inserted; existing rows were preserved.`);
    return;
  }

  if (command === "generate") {
    const targetDate = args[0] || tomorrowEasternDateKey();
    if (!isTriviaDateKey(targetDate)) throw new Error(`Invalid target date: ${targetDate}`);
    await seedTriviaFallbackQuestions();
    const result = await generateTriviaForDate(targetDate);
    printQuestion(targetDate, result);
    return;
  }

  if (command === "review") {
    const startDate = args[0] || tomorrowEasternDateKey();
    const days = args[1] === undefined ? 7 : Number(args[1]);
    if (!isTriviaDateKey(startDate)) throw new Error(`Invalid review start date: ${startDate}`);
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      throw new Error("Review days must be an integer from 1 to 31.");
    }
    await seedTriviaFallbackQuestions();
    const results = await preGenerateTriviaDays(startDate, days);
    results.forEach((result, index) => {
      // The returned rows are in order from the requested Eastern date.
      const date = new Date(`${startDate}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + index);
      printQuestion(date.toISOString().slice(0, 10), result);
    });
    return;
  }

  if (command === "reset") {
    const [displayId, date] = args;
    const allowlist = (process.env.TRIVIA_TEST_USER_IDS ?? TRIVIA_TEST_DISPLAY_IDS.join(","))
      .split(",").map((id) => id.trim()).filter(Boolean);
    if (process.env.TRIVIA_TEST_MODE === "false") {
      throw new Error("The answer reset command is disabled when TRIVIA_TEST_MODE=false.");
    }
    if (displayId !== TRIVIA_TEST_DISPLAY_IDS[0] || !allowlist.includes(displayId)) {
      throw new Error(`Reset is restricted to the configured test user ${TRIVIA_TEST_DISPLAY_IDS[0]}.`);
    }
    if (!date || !isTriviaDateKey(date)) throw new Error("Provide a valid Eastern trivia date.");
    const result = await resetTriviaAnswer(date);
    console.log(JSON.stringify({ display_id: displayId, date, ...result }, null, 2));
    return;
  }

  if (command === "set-tiers") {
    if (args.length !== 8) {
      throw new Error("Provide exactly eight strictly increasing positive integer thresholds.");
    }
    const thresholds = args.map(Number);
    if (thresholds.some((threshold) => !Number.isInteger(threshold) || threshold <= 0)) {
      throw new Error("Tier thresholds must all be positive integers.");
    }
    const tiers = await updateTriviaTiers(thresholds.map((correctAnswersRequired, index) => ({
      tier: index + 1,
      correctAnswersRequired,
    })));
    console.log(JSON.stringify({ updated: true, tiers }, null, 2));
    return;
  }

  if (command === "set-mapping") {
    const [category, patchId] = args;
    if (!isTriviaCategory(category)) throw new Error("Provide a valid trivia category key.");
    if (!patchId) throw new Error("Provide the destination trivia badge-definition ID.");
    await updateTriviaCategoryMapping(category, patchId);
    console.log(JSON.stringify({
      updated: true,
      category,
      patch_id: patchId,
      reconciliation: "silent; old-family awards remain, new-family award dates are derived from stored correct answers",
    }, null, 2));
    return;
  }

  throw new Error(`Unknown command "${command}".\n${usage()}`);
}

main()
  .catch((error) => {
    console.error("[Trivia] Operation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });