import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  dailyTrivia,
  triviaFallback,
  triviaGenerationAttempts,
} from "@shared/schema";
import {
  categoryForTriviaDate,
  easternDateKey,
  isTriviaCategory,
  isTriviaDateKey,
  isTriviaTestMode,
  shiftDateKey,
  TRIVIA_CATEGORY_LABELS,
  TRIVIA_TIME_ZONE,
  type TriviaCategory,
} from "@shared/trivia";

/**
 * Verified against Anthropic's official model catalogue:
 * https://docs.anthropic.com/en/docs/about-claude/models/all-models
 *
 * Keep this exact ID as requested. An unavailable model is surfaced in attempt
 * logs and falls back to the seeded question pool; there is no silent model
 * substitution.
 */
export const TRIVIA_MODEL = "claude-sonnet-5-5";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL_URL = `https://api.anthropic.com/v1/models/${encodeURIComponent(TRIVIA_MODEL)}`;
const ANTHROPIC_API_VERSION = "2023-06-01";
const MAX_GENERATION_ATTEMPTS = 3;
const API_RETRIES = 3;

export const SPECIAL_TRIVIA_FORMATS = [
  "This Day in Hockey History",
  "Name That Player",
  "Who Am I?",
  "Stat Line Mystery",
] as const;

export type SpecialTriviaFormat = typeof SPECIAL_TRIVIA_FORMATS[number];

export type TriviaQuestion = {
  category: TriviaCategory;
  question: string;
  choices: [string, string, string, string];
  correct_index: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  source_basis: string;
};

export type TriviaVerifierVerdict = {
  independent_correct_index: number;
  keyed_answer_correct: boolean;
  another_choice_arguably_correct: boolean;
  time_sensitive_or_ambiguous: boolean;
  confidence: "high" | "medium" | "low";
  notes: string;
};

const triviaQuestionSchema = z.object({
  category: z.custom<TriviaCategory>(isTriviaCategory),
  question: z.string().min(1).max(199),
  choices: z.tuple([
    z.string().min(1).max(39),
    z.string().min(1).max(39),
    z.string().min(1).max(39),
    z.string().min(1).max(39),
  ]),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(1000),
  difficulty: z.enum(["easy", "medium", "hard"]),
  source_basis: z.string().min(1).max(1000).refine(
    (basis) => /https?:\/\/\S+/i.test(basis),
    "source_basis must include a direct source URL.",
  ),
}).strict().refine(
  (question) => new Set(question.choices.map((choice) => choice.trim().toLocaleLowerCase())).size === 4
    && question.question.trim().length > 0
    && question.choices.every((choice) => choice.trim().length > 0),
  "The question must be non-empty and contain four distinct, non-empty choices.",
);

const verifierVerdictSchema = z.object({
  independent_correct_index: z.number().int().min(0).max(3),
  keyed_answer_correct: z.boolean(),
  another_choice_arguably_correct: z.boolean(),
  time_sensitive_or_ambiguous: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().min(1).max(2000),
}).strict();

const SPECIAL_FORMAT_INTERVAL_DAYS = 9;

/** Selects a special format every ninth trivia date without changing category rotation. */
export function formatForTriviaDate(dateKey: string): SpecialTriviaFormat | null {
  if (!isTriviaDateKey(dateKey)) throw new Error(`Invalid trivia date: ${dateKey}`);
  const days = Math.floor(
    (Date.parse(`${dateKey}T00:00:00.000Z`) - Date.parse("2024-01-01T00:00:00.000Z")) / 86_400_000,
  );
  if (days % SPECIAL_FORMAT_INTERVAL_DAYS !== 0) return null;
  return SPECIAL_TRIVIA_FORMATS[
    Math.floor(days / SPECIAL_FORMAT_INTERVAL_DAYS) % SPECIAL_TRIVIA_FORMATS.length
  ];
}

/** Tomorrow in New York, including DST transitions. */
export function tomorrowEasternDateKey(now = new Date()): string {
  return shiftDateKey(easternDateKey(now), 1);
}

export function validateTriviaQuestion(value: unknown): TriviaQuestion {
  return triviaQuestionSchema.parse(value);
}

export function validateVerifierVerdict(value: unknown): TriviaVerifierVerdict {
  return verifierVerdictSchema.parse(value);
}

export function judgeTriviaVerification(
  question: TriviaQuestion,
  verdict: TriviaVerifierVerdict,
): { approved: boolean; notes: string } {
  const categoryMatches = isTriviaCategory(question.category);
  const approved = categoryMatches
    && verdict.independent_correct_index === question.correct_index
    && verdict.keyed_answer_correct
    && !verdict.another_choice_arguably_correct
    && !verdict.time_sensitive_or_ambiguous
    && verdict.confidence === "high";
  const notes = [
    `Independent answer: ${verdict.independent_correct_index}; keyed answer: ${question.correct_index}.`,
    `Keyed answer correct: ${verdict.keyed_answer_correct}.`,
    `Another choice arguably correct: ${verdict.another_choice_arguably_correct}.`,
    `Time-sensitive or ambiguous: ${verdict.time_sensitive_or_ambiguous}.`,
    `Confidence: ${verdict.confidence}.`,
    verdict.notes,
  ].join(" ");
  return { approved, notes };
}

function normalizedQuestionTokens(question: string): Set<string> {
  return new Set(question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
}

/** Rejects exact repeats and very close question rewrites before blind review. */
export function findQuestionRepeatReason(
  question: string,
  recentQuestions: readonly { question: string }[],
): string | null {
  const normalized = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = normalizedQuestionTokens(question);
  for (const previous of recentQuestions) {
    const priorNormalized = previous.question.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (normalized === priorNormalized) return "An exact duplicate of a recent question was generated.";
    const priorTokens = normalizedQuestionTokens(previous.question);
    const intersection = Array.from(tokens).filter((token) => priorTokens.has(token)).length;
    const union = new Set(Array.from(tokens).concat(Array.from(priorTokens))).size;
    if (union >= 5 && intersection / union >= 0.8) {
      return "A near-duplicate of a recent question was generated.";
    }
  }
  return null;
}

export function decodeStrictJson<T>(content: string, schema: z.ZodType<T>): T {
  const parsed: unknown = JSON.parse(content);
  return schema.parse(parsed);
}

type AnthropicTextBlock = { type: string; text?: string };
type AnthropicMessageResponse = { content?: AnthropicTextBlock[] };

class AnthropicRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = true) {
    super(message);
    this.name = "AnthropicRequestError";
  }
}

function retryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, 400 * (2 ** attempt))));
}

/**
 * Authenticated availability check. The exact requested model must be visible
 * to this key before any Messages request is made; a different model is never
 * selected as a fallback.
 */
export async function preflightAnthropicModel(
  apiKey = process.env.ANTHROPIC_API_KEY,
  fetcher: typeof fetch = fetch,
): Promise<{ id: typeof TRIVIA_MODEL }> {
  if (!apiKey) {
    throw new AnthropicRequestError("ANTHROPIC_API_KEY is not configured; model preflight cannot run.", undefined, false);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < API_RETRIES; attempt += 1) {
    try {
      const response = await fetcher(ANTHROPIC_MODEL_URL, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1200);
        const unavailable = response.status === 404;
        throw new AnthropicRequestError(
          unavailable
            ? `Requested Anthropic model ${TRIVIA_MODEL} is unavailable to this API key (HTTP 404).`
            : `Anthropic model preflight returned HTTP ${response.status}: ${detail}`,
          response.status,
          !unavailable && retryableHttpStatus(response.status),
        );
      }
      const model: unknown = await response.json();
      if (typeof model !== "object" || model === null || !("id" in model) || model.id !== TRIVIA_MODEL) {
        throw new AnthropicRequestError(
          `Anthropic model preflight did not confirm the requested model ID ${TRIVIA_MODEL}.`,
          undefined,
          false,
        );
      }
      return { id: TRIVIA_MODEL };
    } catch (error) {
      lastError = error;
      if (error instanceof AnthropicRequestError && !error.retryable) throw error;
      if (attempt + 1 < API_RETRIES) await waitBeforeRetry(attempt);
    }
  }

  throw new Error(`Anthropic model preflight failed after ${API_RETRIES} attempts: ${String(lastError)}`);
}

let cachedPreflight: { apiKey: string; promise: Promise<void> } | null = null;

async function ensureAnthropicModelAvailable(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await preflightAnthropicModel(apiKey);
    return;
  }
  if (cachedPreflight?.apiKey === apiKey) return cachedPreflight.promise;

  const promise = preflightAnthropicModel(apiKey).then(() => undefined);
  cachedPreflight = { apiKey, promise };
  try {
    await promise;
  } catch (error) {
    if (cachedPreflight?.promise === promise) cachedPreflight = null;
    throw error;
  }
}

/** Sonnet 5.5 rejects the deprecated temperature option. */
export function buildTriviaModelRequest(prompt: string) {
  return {
    model: TRIVIA_MODEL,
    max_tokens: 1400,
    messages: [{ role: "user" as const, content: prompt }],
  };
}

async function callAnthropicJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicRequestError("ANTHROPIC_API_KEY is not configured.", undefined, false);
  }
  await ensureAnthropicModelAvailable();

  let lastError: unknown;
  for (let attempt = 0; attempt < API_RETRIES; attempt += 1) {
    try {
      const response = await fetcher(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(buildTriviaModelRequest(prompt)),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1200);
        throw new AnthropicRequestError(
          `Anthropic returned HTTP ${response.status}: ${detail}`,
          response.status,
          retryableHttpStatus(response.status),
        );
      }
      const message = await response.json() as AnthropicMessageResponse;
      const text = message.content?.find((block) => block.type === "text")?.text;
      if (!text) throw new AnthropicRequestError("Anthropic response had no text block.");
      return decodeStrictJson(text, schema);
    } catch (error) {
      lastError = error;
      if (error instanceof AnthropicRequestError && !error.retryable) throw error;
      if (attempt + 1 < API_RETRIES) await waitBeforeRetry(attempt);
    }
  }

  throw new Error(`Anthropic JSON request failed after ${API_RETRIES} attempts: ${String(lastError)}`);
}

function generatorPrompt({
  targetDate,
  category,
  specialFormat,
  recentQuestions,
  previousFailure,
}: {
  targetDate: string;
  category: TriviaCategory;
  specialFormat: SpecialTriviaFormat | null;
  recentQuestions: Array<{ category: string; question: string }>;
  previousFailure?: string;
}): string {
  const categoryLabel = TRIVIA_CATEGORY_LABELS[category];
  const dateInstruction = specialFormat === "This Day in Hockey History"
    ? `Tie the question to a well-documented hockey event that occurred on ${targetDate} (month and day included).`
    : "";
  const formatInstruction = specialFormat
    ? `Use the presentation format "${specialFormat}". ${dateInstruction}`
    : "Use a direct multiple-choice question.";
  return `Create exactly one accurate, easy-to-verify hockey trivia question for the target date ${targetDate}.

The category MUST be exactly "${category}" (${categoryLabel}); special formats are presentation styles and never replace the category.
${formatInstruction}
Rules:
- Use only highly confident, widely documented facts; avoid obscure or disputed records and facts that change over time.
- There must be exactly one unambiguously correct choice. The three distractors must be plausible but clearly wrong.
- Question must be under 200 characters; each of exactly four choices must be under 40 characters.
- Explanation must be one or two concise sentences.
- Include a trustworthy source title and a direct source URL in source_basis.
- Return ONLY a JSON object with exactly these fields: category, question, choices (array of exactly 4 strings), correct_index (integer 0-3), explanation, difficulty (easy|medium|hard), source_basis.
- Do not wrap the JSON in markdown.
${previousFailure ? `Previous attempt was rejected. Avoid this failure: ${previousFailure}` : ""}

The following recent questions are provided only to prevent duplicate or near-duplicate content:
${JSON.stringify(recentQuestions)}`;
}

export function buildBlindVerifierPrompt(question: TriviaQuestion): string {
  // Deliberately omit correct_index, source_basis, and all generator reasoning.
  const blindQuestion = {
    category: question.category,
    question: question.question,
    choices: question.choices,
  };
  return `Independently verify this hockey trivia question from first principles using well-established hockey knowledge. You have not been told which answer the author keyed.

Question data:
${JSON.stringify(blindQuestion)}

Return ONLY a JSON object with exactly these fields:
{"independent_correct_index":0,"keyed_answer_correct":true,"another_choice_arguably_correct":false,"time_sensitive_or_ambiguous":false,"confidence":"high","notes":"Concise factual reasoning"}
Since no keyed answer was supplied, set keyed_answer_correct to true only if the independently selected choice is uniquely correct based on reliable, established facts; otherwise false. Set another_choice_arguably_correct if any other option could also reasonably be defended. Flag time-sensitive or ambiguous wording. Confidence must be high, medium, or low. Do not invent facts or use outside assumptions.`;
}

async function logAttempt({
  targetDate,
  attempt,
  question,
  verdict,
  notes,
}: {
  targetDate: string;
  attempt: number;
  question: TriviaQuestion | null;
  verdict: string;
  notes: string;
}): Promise<void> {
  const entry = {
    targetDate,
    attempt,
    question,
    verdict,
    notes,
  };
  // Console logging is a backup for database outages; normal logs are queryable
  // in trivia_generation_attempts for review by target date.
  console.info(`[TriviaGenerationAttempt] ${JSON.stringify(entry)}`);
  try {
    if (attempt <= 3 && ["verified", "rejected", "error"].includes(verdict)) {
      const { recordTriviaGenerationAttempt } = await import("./trivia");
      await recordTriviaGenerationAttempt({
        targetDate,
        attempt,
        question,
        verdict: verdict === "verified" ? "accepted" : verdict as "rejected" | "error",
        notes,
      });
    } else {
      // The shared log API intentionally limits model attempts to 1–3. Attempt
      // 4 is the operational fallback event, retained as a separate DB row.
      const { db } = await import("./db");
      await db.insert(triviaGenerationAttempts).values({
        targetDate,
        attempt,
        question,
        verdict,
        notes,
      });
    }
  } catch (error) {
    console.error("[TriviaGenerationAttempt] Database audit insert failed:", error);
  }
}

type DailyTriviaRow = typeof dailyTrivia.$inferSelect;

/**
 * Returns the question already published for a target date, or generates and
 * stores it. The unique date constraint and conflict handling make parallel
 * scheduled/manual runs safe.
 */
export async function generateTriviaForDate(
  targetDate: string,
  options: { allowFallback?: boolean } = {},
): Promise<{ row: DailyTriviaRow; created: boolean; fallbackUsed: boolean }> {
  if (!isTriviaDateKey(targetDate)) throw new Error(`Invalid trivia date: ${targetDate}`);

  const { db } = await import("./db");
  const [existing] = await db.select().from(dailyTrivia).where(eq(dailyTrivia.date, targetDate)).limit(1);
  if (existing) return { row: existing, created: false, fallbackUsed: existing.verificationStatus === "fallback" };

  const category = categoryForTriviaDate(targetDate);
  const specialFormat = formatForTriviaDate(targetDate);
  const recentQuestions = await db.select({
    category: dailyTrivia.category,
    question: dailyTrivia.question,
  }).from(dailyTrivia)
    .where(lt(dailyTrivia.date, targetDate))
    .orderBy(desc(dailyTrivia.date))
    .limit(60);
  const recent = recentQuestions;

  let previousFailure: string | undefined;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let question: TriviaQuestion | null = null;
    try {
      question = await callAnthropicJson(
        generatorPrompt({ targetDate, category, specialFormat, recentQuestions: recent, previousFailure }),
        triviaQuestionSchema,
      );
      if (question.category !== category) {
        throw new Error(`Generated category ${question.category} does not match scheduled category ${category}.`);
      }
      const repeatReason = findQuestionRepeatReason(question.question, recent);
      if (repeatReason) throw new Error(repeatReason);
      const verdict = await callAnthropicJson(
        buildBlindVerifierPrompt(question),
        verifierVerdictSchema,
      );
      const judgment = judgeTriviaVerification(question, verdict);
      await logAttempt({
        targetDate,
        attempt,
        question,
        verdict: judgment.approved ? "verified" : "rejected",
        notes: judgment.notes,
      });
      if (!judgment.approved) {
        previousFailure = judgment.notes;
        continue;
      }

      const { publishTriviaQuestion } = await import("./trivia");
      const publication = await publishTriviaQuestion(targetDate, {
        category: question.category,
        question: question.question,
        choices: question.choices,
        correct_index: question.correct_index,
        explanation: question.explanation,
        difficulty: question.difficulty,
        format: specialFormat,
        source_basis: question.source_basis,
      }, {
        verificationStatus: "verified",
        verificationNotes: judgment.notes,
        sourceBasis: question.source_basis,
        format: specialFormat,
      });
      const [published] = await db.select().from(dailyTrivia)
        .where(eq(dailyTrivia.date, targetDate)).limit(1);
      if (published) {
        return {
          row: published,
          created: publication.published,
          fallbackUsed: published.verificationStatus === "fallback",
        };
      }
      throw new Error(`Daily trivia publication for ${targetDate} reported ${publication.published} but no row exists.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await logAttempt({ targetDate, attempt, question, verdict: "error", notes: detail });
      previousFailure = detail;
      if (error instanceof AnthropicRequestError && !error.retryable) {
        // Missing keys or model/auth configuration errors will not recover with
        // another generation attempt. Record the failure and use fallback.
        break;
      }
    }
  }

  if (options.allowFallback === false) {
    throw new Error(`No verified question generated for ${targetDate}: ${previousFailure ?? "unknown failure"}`);
  }
  return useFallbackQuestion(targetDate, previousFailure ?? "Three generation/verification attempts failed.", specialFormat);
}

async function useFallbackQuestion(
  targetDate: string,
  failureReason: string,
  specialFormat: SpecialTriviaFormat | null,
): Promise<{ row: DailyTriviaRow; created: boolean; fallbackUsed: boolean }> {
  const { db } = await import("./db");
  const category = categoryForTriviaDate(targetDate);
  let published: DailyTriviaRow;
  let fallbackPublished = false;
  try {
    published = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`daily_trivia:${targetDate}`}))`);
    const [alreadyPublished] = await tx.select().from(dailyTrivia)
      .where(eq(dailyTrivia.date, targetDate)).limit(1);
    if (alreadyPublished) return alreadyPublished;

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('trivia_fallback_reservation'))`);
    let [fallback] = await tx.select().from(triviaFallback)
      .where(and(isNull(triviaFallback.usedOn), eq(triviaFallback.category, category)))
      .orderBy(asc(triviaFallback.createdAt), asc(triviaFallback.id))
      .limit(1)
      .for("update", { skipLocked: true });
    let categoryMismatch = false;
    if (!fallback) {
      [fallback] = await tx.select().from(triviaFallback)
        .where(isNull(triviaFallback.usedOn))
        .orderBy(asc(triviaFallback.createdAt), asc(triviaFallback.id))
        .limit(1)
        .for("update", { skipLocked: true });
      categoryMismatch = !!fallback && fallback.category !== category;
    }
    let questionRepeated = false;
    if (!fallback) {
      [fallback] = await tx.select().from(triviaFallback)
        .orderBy(asc(triviaFallback.usedOn), asc(triviaFallback.createdAt), asc(triviaFallback.id))
        .limit(1)
        .for("update");
      questionRepeated = !!fallback;
    }
    if (!fallback) {
      throw new Error(
        `TRIVIA FALLBACK INVENTORY EMPTY for ${targetDate}; no question is available to publish. ` +
        `Seed verified fallback questions before retrying. ` +
        `Generation failure: ${failureReason}`,
      );
    }

    const [claimed] = await tx.update(triviaFallback)
      .set({ usedOn: targetDate })
      .where(questionRepeated
        ? eq(triviaFallback.id, fallback.id)
        : and(eq(triviaFallback.id, fallback.id), isNull(triviaFallback.usedOn)))
      .returning({ id: triviaFallback.id });
    if (!claimed) throw new Error("Could not atomically claim the selected trivia fallback question.");

    const [row] = await tx.insert(dailyTrivia).values({
      date: targetDate,
      category: fallback.category,
      question: fallback.question,
      choices: fallback.choices,
      correctIndex: fallback.correctIndex,
      explanation: fallback.explanation,
      difficulty: fallback.difficulty,
      format: fallback.format ?? specialFormat,
      verificationStatus: "fallback",
      verificationNotes: [
        `Seeded fallback used after generation failure: ${failureReason}`,
        categoryMismatch ? `No unused ${category} fallback remained; used ${fallback.category} instead.` : "",
        questionRepeated ? "The unused fallback pool was exhausted; the least-recently-used fallback was reused to keep this date populated." : "",
      ].filter(Boolean).join(" "),
      sourceBasis: fallback.verificationNotes,
    }).onConflictDoNothing({ target: dailyTrivia.date }).returning();
    if (row) {
      fallbackPublished = true;
      return row;
    }

    const [winner] = await tx.select().from(dailyTrivia)
      .where(eq(dailyTrivia.date, targetDate)).limit(1);
    if (!winner) throw new Error(`Fallback insert for ${targetDate} conflicted but no daily row exists.`);
    return winner;
    });
  } catch (error) {
    console.error(`[TriviaFallbackPoolExhausted] ${JSON.stringify({
      severity: "alert",
      targetDate,
      category,
      reason: error instanceof Error ? error.message : String(error),
      continuityPolicy: "Never leave a date empty: use another unused vetted category, then the least-recently-used vetted fallback, with an alert.",
    })}`);
    throw error;
  }

  if (fallbackPublished) {
    await logAttempt({
      targetDate,
      attempt: MAX_GENERATION_ATTEMPTS + 1,
      question: {
        category: published.category,
        question: published.question,
        choices: published.choices as TriviaQuestion["choices"],
        correct_index: published.correctIndex,
        explanation: published.explanation,
        difficulty: published.difficulty as TriviaQuestion["difficulty"],
        source_basis: published.sourceBasis ?? published.verificationNotes ?? "Seeded fallback source note unavailable.",
      },
      verdict: "fallback",
      notes: `Fallback ${published.id} published. ${published.verificationNotes ?? ""}`,
    });
  }
  if (
    published.category !== category
    || published.verificationNotes?.includes("least-recently-used") === true
  ) {
    console.error(`[TriviaFallbackContinuityAlert] ${JSON.stringify({
      severity: "alert",
      targetDate,
      expectedCategory: category,
      selectedCategory: published.category,
      repeated: published.verificationNotes?.includes("least-recently-used") === true,
      policy: "Keep every date populated; log category drift or fallback reuse and replenish the reviewed fallback pool.",
    })}`);
  }
  console.error(`[TriviaFallbackAlert] ${JSON.stringify({
    severity: "alert",
    targetDate,
      dailyTriviaId: published.id,
    reason: failureReason,
  })}`);
  return { row: published, created: fallbackPublished, fallbackUsed: published.verificationStatus === "fallback" };
}

/** Generates tomorrow's question, using the Eastern calendar date. */
export function generateTomorrowTrivia() {
  return generateTriviaForDate(tomorrowEasternDateKey());
}

/** Generate a seven-day review batch; existing dates remain untouched. */
export async function preGenerateTriviaDays(startDate = tomorrowEasternDateKey(), days = 7) {
  if (!isTriviaDateKey(startDate)) throw new Error(`Invalid trivia date: ${startDate}`);
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error("Review batch must contain 1–31 days.");
  const rows = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = shiftDateKey(startDate, offset);
    const result = await generateTriviaForDate(date);
    rows.push(result);
  }
  return rows;
}

export function triviaGenerationConfiguration() {
  return {
    model: TRIVIA_MODEL,
    timezone: TRIVIA_TIME_ZONE,
    testMode: isTriviaTestMode(),
  };
}