import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheTrivia, clearCachedTrivia, isTriviaPushLaunch, readCachedTrivia } from "./triviaCache";
import { triviaOverlayBlocksOpening, type TriviaToday } from "./triviaVisibility";

const question: TriviaToday = {
  date: "2026-10-02", category: "NHL History", question: "Q?",
  choices: ["A", "B", "C", "D"], difficulty: "easy", answered: false,
  correct_index: 0, explanation: "A.",
};

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

test("same-day cache restores all four choices immediately for only that account", () => {
  const cache = storage();
  cacheTrivia(cache, "player-one", question);
  assert.deepEqual(readCachedTrivia(cache, "player-one", question.date), question);
  assert.equal(readCachedTrivia(cache, "player-two", question.date), undefined);
  assert.equal(readCachedTrivia(cache, "player-one", "2026-10-03"), undefined);
  clearCachedTrivia(cache, "player-one");
  assert.equal(readCachedTrivia(cache, "player-one", question.date), undefined);
});

test("confirmed answers remain answered in cache and cannot earn progress twice", () => {
  const cache = storage();
  const answered = { ...question, answered: true, chosen_index: 1,
    feedback: { is_correct: false, correct_index: 0, explanation: "A.", streak: 0,
      category: "NHL History", correct_count: 0 } };
  cacheTrivia(cache, "player-one", answered);
  assert.deepEqual(readCachedTrivia(cache, "player-one", question.date), answered);
});

test("corrupt, invalid, missing and unavailable caches do not replace the live API", () => {
  const cache = storage();
  const invalid = ["not json", "null", JSON.stringify({ ...question, choices: ["A"] }),
    JSON.stringify({ ...question, correct_index: 4 }), JSON.stringify({ ...question, correct_index: null }),
    JSON.stringify({ ...question, explanation: null })];
  for (const value of invalid) {
    cache.setItem("roster.trivia.today:player-one", value);
    assert.equal(readCachedTrivia(cache, "player-one", question.date), undefined);
  }
  assert.equal(readCachedTrivia(null, "player-one", question.date), undefined);
  const blocked = { getItem: () => { throw Error("storage blocked"); },
    setItem: () => { throw Error("storage blocked"); }, removeItem: () => { throw Error("storage blocked"); } };
  assert.equal(readCachedTrivia(blocked, "player-one", question.date), undefined);
  assert.doesNotThrow(() => cacheTrivia(blocked, "player-one", question));
  assert.doesNotThrow(() => clearCachedTrivia(blocked, "player-one"));
});

test("push intent is explicit and independent from a slow dashboard or progress query", () => {
  assert.equal(isTriviaPushLaunch("?trivia=1"), true);
  assert.equal(isTriviaPushLaunch("?other=anything&trivia=1"), true);
  assert.equal(isTriviaPushLaunch(""), false);
  assert.equal(isTriviaPushLaunch("?trivia=0"), false);
});

test("pending birthday and badge requests never delay a ready question", () => {
  assert.equal(triviaOverlayBlocksOpening(false, undefined), false);
  assert.equal(triviaOverlayBlocksOpening(false, []), false);
  assert.equal(triviaOverlayBlocksOpening(false, null), false);
  assert.equal(triviaOverlayBlocksOpening(false, [{ id: "earned" }]), true);
  assert.equal(triviaOverlayBlocksOpening(true, []), true);
});