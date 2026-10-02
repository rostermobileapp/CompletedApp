import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryForTriviaDate,
  easternDateKey,
  shiftDateKey,
  TRIVIA_CATEGORIES,
} from "@shared/trivia";
import {
  decodeStrictJson,
  buildBlindVerifierPrompt,
  buildTriviaModelRequest,
  findQuestionRepeatReason,
  formatForTriviaDate,
  judgeTriviaVerification,
  preflightAnthropicModel,
  tomorrowEasternDateKey,
  validateTriviaQuestion,
  validateVerifierVerdict,
  type TriviaQuestion,
} from "./triviaGeneration";

const question: TriviaQuestion = {
  category: "nhl_history",
  question: "In what year was the NHL founded?",
  choices: ["1909", "1917", "1924", "1930"],
  correct_index: 1,
  explanation: "The National Hockey League was founded in 1917.",
  difficulty: "easy",
  source_basis: "NHL.com History, https://www.nhl.com/",
};

describe("daily trivia generation validation", () => {
  test("Sonnet 5.5 requests omit unsupported legacy sampling parameters", () => {
    const request = buildTriviaModelRequest("Generate a question.");
    assert.deepEqual(request, {
      model: "claude-sonnet-5-5",
      max_tokens: 1400,
      messages: [{ role: "user", content: "Generate a question." }],
    });
    assert.equal("temperature" in request, false);
  });
  test("rotates through each of the nine categories in calendar-date order", () => {
    const start = "2026-01-01";
    const sequence = Array.from({ length: TRIVIA_CATEGORIES.length }, (_, day) =>
      categoryForTriviaDate(shiftDateKey(start, day)));
    assert.deepEqual(new Set(sequence), new Set(TRIVIA_CATEGORIES));
    assert.equal(categoryForTriviaDate(shiftDateKey(start, 9)), categoryForTriviaDate(start));
  });

  test("uses New York dates for tomorrow over both sides of the DST boundary", () => {
    const beforeMidnight = new Date("2026-03-08T04:59:00.000Z");
    const afterMidnight = new Date("2026-03-08T05:00:00.000Z");
    assert.equal(easternDateKey(beforeMidnight), "2026-03-07");
    assert.equal(tomorrowEasternDateKey(beforeMidnight), "2026-03-08");
    assert.equal(easternDateKey(afterMidnight), "2026-03-08");
    assert.equal(tomorrowEasternDateKey(afterMidnight), "2026-03-09");
  });

  test("uses each supported presentation format without changing the category contract", () => {
    assert.equal(formatForTriviaDate("2024-01-01"), "This Day in Hockey History");
    assert.equal(formatForTriviaDate("2024-01-02"), null);
    assert.equal(formatForTriviaDate("2024-01-10"), "Name That Player");
  });

  test("accepts only strict question JSON with four short answer choices", () => {
    assert.deepEqual(validateTriviaQuestion(question), question);
    assert.throws(() => validateTriviaQuestion({ ...question, choices: ["A", "B", "C"] }));
    assert.throws(() => validateTriviaQuestion({ ...question, choices: ["A", " a ", "C", "D"] }));
    assert.throws(() => validateTriviaQuestion({ ...question, choices: [" ", "B", "C", "D"] }));
    assert.throws(() => validateTriviaQuestion({ ...question, choices: ["x".repeat(40), "B", "C", "D"] }));
    assert.throws(() => validateTriviaQuestion({ ...question, category: "goalie_stats" }));
    assert.throws(() => validateTriviaQuestion({ ...question, extra: "not in the JSON schema" }));
    assert.throws(() => decodeStrictJson("{bad json", validateTriviaQuestion));
  });

  test("identifies repeated and near-duplicate question text", () => {
    const recent = [{ question: "Which NHL team won the Stanley Cup in 1967?" }];
    assert.match(findQuestionRepeatReason("Which NHL team won the Stanley Cup in 1967?", recent) ?? "", /exact duplicate/);
    assert.match(findQuestionRepeatReason("Which NHL team won the Stanley Cup in 1968?", recent) ?? "", /near-duplicate/);
    assert.equal(findQuestionRepeatReason(question.question, recent), null);
  });

  test("accepts a verifier only when its blind answer and all quality checks agree", () => {
    const verdict = validateVerifierVerdict({
      independent_correct_index: 1,
      keyed_answer_correct: true,
      another_choice_arguably_correct: false,
      time_sensitive_or_ambiguous: false,
      confidence: "high",
      notes: "The NHL began in 1917.",
    });
    assert.equal(judgeTriviaVerification(question, verdict).approved, true);
    assert.equal(judgeTriviaVerification(question, {
      ...verdict,
      independent_correct_index: 0,
    }).approved, false);
    assert.equal(judgeTriviaVerification(question, {
      ...verdict,
      another_choice_arguably_correct: true,
    }).approved, false);
    assert.equal(judgeTriviaVerification(question, {
      ...verdict,
      confidence: "medium",
    }).approved, false);
    assert.throws(() => validateVerifierVerdict({ ...verdict, source_basis: "leaked keyed answer" }));
  });

  test("verifier prompt includes choices but never leaks the keyed answer or source basis", () => {
    const prompt = buildBlindVerifierPrompt(question);
    assert.match(prompt, /"choices":\["1909","1917","1924","1930"\]/);
    assert.doesNotMatch(prompt, /"correct_index":1/);
    assert.doesNotMatch(prompt, /source_basis|NHL\.com History/);
  });

  test("authenticated model preflight rejects a missing key without making a request", async () => {
    let calls = 0;
    await assert.rejects(
      preflightAnthropicModel("", async () => {
        calls += 1;
        return Response.json({ id: "unused" });
      }),
      /ANTHROPIC_API_KEY is not configured/,
    );
    assert.equal(calls, 0);
  });

  test("authenticated model preflight rejects an unavailable exact model without fallback", async () => {
    let calls = 0;
    await assert.rejects(
      preflightAnthropicModel("unit-test-key", async (input, init) => {
        calls += 1;
        assert.equal(String(input), "https://api.anthropic.com/v1/models/claude-sonnet-5-5");
        assert.equal(init?.method, "GET");
        assert.equal(new Headers(init?.headers).get("x-api-key"), "unit-test-key");
        return new Response("model not found", { status: 404 });
      }),
      /claude-sonnet-5-5 is unavailable/,
    );
    assert.equal(calls, 1);
  });

  test("authenticated model preflight confirms only the requested model ID", async () => {
    const result = await preflightAnthropicModel("unit-test-key", async () =>
      Response.json({ id: "claude-sonnet-5-5", type: "model" }));
    assert.deepEqual(result, { id: "claude-sonnet-5-5" });
    await assert.rejects(
      preflightAnthropicModel("unit-test-key", async () =>
        Response.json({ id: "claude-sonnet-4-5", type: "model" })),
      /did not confirm the requested model ID/,
    );
  });
});