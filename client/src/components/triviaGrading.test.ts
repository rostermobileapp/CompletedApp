import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeTriviaChoice } from "./triviaGrading";

const today = {
  date: "2026-10-02", category: "NHL History", question: "Which year?",
  choices: ["1917", "1920", "1926", "1930"], difficulty: "easy", answered: false,
  correct_index: 0, explanation: "The NHL was founded in 1917.",
};

test("correct choice grades synchronously with explanation and no invented progress", () => {
  const result = gradeTriviaChoice(today, 0);
  assert.deepEqual(result, {
    date: today.date, chosen_index: 0, is_correct: true, correct_index: 0,
    explanation: today.explanation,
  });
  assert.equal("streak" in result, false);
  assert.equal("correct_count" in result, false);
  assert.equal("patch" in result, false);
});

test("wrong choice immediately identifies the correct answer", () => {
  const result = gradeTriviaChoice(today, 2);
  assert.equal(result.is_correct, false);
  assert.equal(result.chosen_index, 2);
  assert.equal(result.correct_index, 0);
});

test("rejects missing or malformed answer keys instead of displaying incorrect feedback", () => {
  for (const correct_index of [undefined, -1, 4, 0.5, NaN]) {
    assert.throws(() => gradeTriviaChoice({ ...today, correct_index }, 0), /Reload the question/);
  }
  assert.throws(() => gradeTriviaChoice({ ...today, explanation: "" }, 0), /Reload the question/);
});

test("rejects invalid selections and handles every correct-answer position", () => {
  for (const index of [-1, 4, 0.5, NaN]) {
    assert.throws(() => gradeTriviaChoice(today, index), /Choose one/);
  }
  for (let correct_index = 0; correct_index < 4; correct_index++) {
    const result = gradeTriviaChoice({ ...today, correct_index }, correct_index);
    assert.equal(result.is_correct, true);
    assert.equal(result.correct_index, correct_index);
  }
});