import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { TRIVIA_CATEGORIES } from "@shared/trivia";
import { findQuestionRepeatReason } from "./triviaGeneration";
import { TRIVIA_FALLBACK_QUESTIONS } from "./triviaFallbackSeed";

describe("daily trivia fallback inventory", () => {
  test("contains 30 sourced, four-choice questions and covers all nine categories", () => {
    assert.equal(TRIVIA_FALLBACK_QUESTIONS.length, 30);
    const categoryCounts = new Map(TRIVIA_CATEGORIES.map((category) => [category, 0]));
    for (const question of TRIVIA_FALLBACK_QUESTIONS) {
      categoryCounts.set(question.category, (categoryCounts.get(question.category) ?? 0) + 1);
      assert.ok(question.question.length > 0 && question.question.length < 200, question.slug);
      assert.equal(question.choices.length, 4, question.slug);
      assert.ok(question.choices.every((choice) => choice.length > 0 && choice.length < 40), question.slug);
      assert.ok(question.correctIndex >= 0 && question.correctIndex <= 3, question.slug);
      assert.match(question.verificationNotes, /Source: https:\/\//, question.slug);
    }
    assert.ok(TRIVIA_CATEGORIES.every((category) => (categoryCounts.get(category) ?? 0) >= 3));
  });

  test("seed rows have unique slugs so repeated seeding cannot multiply the inventory", () => {
    const slugs = TRIVIA_FALLBACK_QUESTIONS.map((question) => question.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  test("inventory questions are not exact or near-duplicate phrasings", () => {
    const previous: Array<{ question: string }> = [];
    for (const question of TRIVIA_FALLBACK_QUESTIONS) {
      assert.equal(findQuestionRepeatReason(question.question, previous), null, question.slug);
      previous.push({ question: question.question });
    }
  });
});