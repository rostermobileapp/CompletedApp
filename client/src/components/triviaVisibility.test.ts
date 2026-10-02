import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canStartManualTrivia, findTriviaCategory, hasServerPatchAccess,
  isSafeTriviaOpportunity, isValidTriviaQuestion,
  readTriviaDismissal, retainQuestionPatch, shouldOfferTrivia,
  shouldRetainTriviaPriority, triviaPlayDestination,
  writeTriviaDismissal,
} from "./triviaVisibility";

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test("trivia is only eligible on safe home opportunities", () => {
  assert.equal(isSafeTriviaOpportunity("/"), true);
  assert.equal(isSafeTriviaOpportunity("/app"), true);
  assert.equal(isSafeTriviaOpportunity("/roster"), false);
  assert.equal(isSafeTriviaOpportunity("/game/42"), false);
  assert.equal(isSafeTriviaOpportunity("/lineup/edit"), false);
});

test("a daily question must contain exactly four string choices", () => {
  const valid = { date: "2026-06-12", category: "NHL History", question: "Q?", choices: ["A", "B", "C", "D"], difficulty: "easy", answered: false };
  assert.equal(isValidTriviaQuestion(valid), true);
  assert.equal(isValidTriviaQuestion({ ...valid, choices: ["A", "B", "C"] }), false);
  assert.equal(isValidTriviaQuestion({ ...valid, choices: ["A", "B", "C", 4] }), false);
});

test("a dismissed question waits until the next launch and never overlaps another host", () => {
  const base = { path: "/", answered: false, dismissed: false, otherOverlayActive: false };
  assert.equal(shouldOfferTrivia(base), true);
  assert.equal(shouldOfferTrivia({ ...base, dismissed: true }), false);
  assert.equal(shouldOfferTrivia({ ...base, answered: true }), false);
  assert.equal(shouldOfferTrivia({ ...base, otherOverlayActive: true }), false);
  assert.equal(shouldOfferTrivia({ ...base, path: "/game/42" }), false);
});

test("Not now persists for this user and Eastern date until a new app launch", () => {
  const storage = makeStorage();
  writeTriviaDismissal(storage, "U00001", "2026-03-08", "launch-a");
  assert.equal(readTriviaDismissal(storage, "U00001", "2026-03-08", "launch-a"), true);
  assert.equal(readTriviaDismissal(storage, "U00001", "2026-03-08", "launch-a"), true, "native resume stays in the same app launch");
  assert.equal(readTriviaDismissal(storage, "U00001", "2026-03-08", "launch-b"), false);
  assert.equal(readTriviaDismissal(storage, "U00002", "2026-03-08", "launch-a"), false);
  assert.equal(readTriviaDismissal(storage, "U00001", "2026-03-09", "launch-a"), false);
});

test("manual play returns from Trophy Case to a safe home opportunity and waits for overlays", () => {
  assert.equal(triviaPlayDestination("/trophy-case"), "/");
  assert.equal(triviaPlayDestination("/"), "/");
  assert.equal(canStartManualTrivia({ path: "/", answered: false, otherOverlayActive: false }), true);
  assert.equal(canStartManualTrivia({ path: "/", answered: false, otherOverlayActive: true }), false);
  assert.equal(canStartManualTrivia({ path: "/", answered: true, otherOverlayActive: false }), false);
});

test("an open answer modal retains priority until Done, even when a patch event arrives", () => {
  assert.equal(shouldRetainTriviaPriority({ path: "/", engaged: true, eligible: true, dismissed: false }), true);
  assert.equal(shouldRetainTriviaPriority({ path: "/", engaged: true, eligible: true, dismissed: true }), false);
  assert.equal(shouldRetainTriviaPriority({ path: "/roster", engaged: true, eligible: true, dismissed: false }), false);
});

test("answer feedback keeps the paid patch artwork and metadata when response patch is partial", () => {
  const patch = retainQuestionPatch(
    { name: "NHL History", imagePath: "/patches/history.png", next_threshold: 5, correct_count: 4 },
    { correct_count: 5 },
  );
  assert.deepEqual(patch, { name: "NHL History", imagePath: "/patches/history.png", next_threshold: 5, correct_count: 5 });
});

test("Trophy Case navigation resolves category slugs and labels after patch data loads", () => {
  const entries = [
    { category: "nhl_history", name: "NHL History" },
    { category: "stanley_cup", name: "Stanley Cup" },
  ];
  assert.deepEqual(findTriviaCategory(entries, "NHL History"), entries[0]);
  assert.deepEqual(findTriviaCategory(entries, "nhl-history"), entries[0]);
  assert.deepEqual(findTriviaCategory(entries, "stanley_cup"), entries[1]);
  assert.equal(findTriviaCategory(entries, "arenas-fans"), undefined);
});

test("patch feedback requires both paid entitlement and a server-provided patch", () => {
  assert.equal(hasServerPatchAccess(true, { name: "NHL History" }), true);
  assert.equal(hasServerPatchAccess(true, undefined), false);
  assert.equal(hasServerPatchAccess(false, { name: "NHL History" }), false);
});