import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryForTriviaDate,
  easternDateKey,
  isTriviaDateKey,
  isTriviaDefinition,
  isTriviaUserEnabled,
  isTriviaTestMode,
  TRIVIA_PUBLIC_LAUNCH_AT,
  shiftDateKey,
  triviaStreaks,
  TRIVIA_CATEGORIES,
  triviaPatchImagePath,
  validateTriviaTiers,
  DEFAULT_TRIVIA_THRESHOLDS,
} from "./trivia";

test("Uploaded Trivia categories use original PNG artwork without changing other categories", () => {
  for (let tier = 1; tier <= 8; tier++) {
    for (const category of ["nhl_history", "stanley_cup", "players_legends", "records_stats", "teams_franchises", "hockey_culture", "movies_media", "nicknames_slang", "arenas_fans"] as const) {
      assert.equal(triviaPatchImagePath(category, tier),
        `/badges/trivia/${category}/tier-${tier}.png?v=20261005`);
    }
    for (const category of TRIVIA_CATEGORIES.filter((category) => !["nhl_history", "stanley_cup", "players_legends", "records_stats", "teams_franchises", "hockey_culture", "movies_media", "nicknames_slang", "arenas_fans"].includes(category))) {
      assert.equal(triviaPatchImagePath(category, tier), `/badges/trivia/${category}/tier-${tier}.svg`);
    }
  }
});

test("Eastern trivia date rolls over at midnight across both daylight-saving transitions", () => {
  assert.equal(easternDateKey(new Date("2024-03-10T04:59:59.999Z")), "2024-03-09");
  assert.equal(easternDateKey(new Date("2024-03-10T05:00:00.000Z")), "2024-03-10");
  assert.equal(easternDateKey(new Date("2024-11-03T03:59:59.999Z")), "2024-11-02");
  assert.equal(easternDateKey(new Date("2024-11-03T04:00:00.000Z")), "2024-11-03");
  assert.equal(shiftDateKey("2024-03-10", 1), "2024-03-11");
});

test("daily category rotation covers all nine categories without weekday gaps", () => {
  const categories = Array.from({ length: TRIVIA_CATEGORIES.length }, (_, i) =>
    categoryForTriviaDate(shiftDateKey("2024-01-01", i)),
  );
  assert.deepEqual(new Set(categories), new Set(TRIVIA_CATEGORIES));
  assert.equal(categoryForTriviaDate("2024-01-10"), categoryForTriviaDate("2024-01-01"));
});

test("trivia date and editable tier config validators reject invalid values", () => {
  assert.equal(isTriviaDateKey("2024-02-29"), true);
  assert.equal(isTriviaDateKey("2023-02-29"), false);
  assert.equal(isTriviaDateKey("2024-2-09"), false);
  assert.deepEqual(validateTriviaTiers(DEFAULT_TRIVIA_THRESHOLDS.map((threshold, index) => ({
    tier: index + 1, correctAnswersRequired: threshold,
  }))).map((tier) => tier.correctAnswersRequired), [1, 5, 10, 25, 50, 100, 150, 200]);
  assert.throws(() => validateTriviaTiers([
    { tier: 1, correctAnswersRequired: 1 },
    { tier: 2, correctAnswersRequired: 1 },
  ]), /eight tiers/);
});

test("correct-answer streaks retain yesterday through today, break on wrong or missed days, and retain best", () => {
  assert.deepEqual(triviaStreaks(["2024-01-01", "2024-01-02", "2024-01-04"], "2024-01-04"), { current: 1, best: 2 });
  assert.deepEqual(triviaStreaks(["2024-01-01", "2024-01-02"], "2024-01-03"), { current: 2, best: 2 });
  assert.deepEqual(triviaStreaks(["2024-01-01", "2024-01-02"], "2024-01-04"), { current: 0, best: 2 });
  assert.deepEqual(triviaStreaks(["2024-01-01", "2024-01-02", "2024-01-03"], "2024-01-03"), { current: 3, best: 3 });
  assert.deepEqual(triviaStreaks(["2024-01-01", "2024-01-02"], "2024-01-03", false), { current: 0, best: 2 });
});

test("test access resolves display IDs and disables the allowlist outside test mode", () => {
  assert.equal(isTriviaUserEnabled("U00001", true, ["U00001"]), true);
  assert.equal(isTriviaUserEnabled("U00002", true, ["U00001"]), false);
  assert.equal(isTriviaUserEnabled("U00002", false, ["U00001"]), true);
  assert.equal(isTriviaUserEnabled(null, false, ["U00001"]), true);
});

test("public launch opens all users at October 7 noon Eastern, even with an old test flag", () => {
  const before = new Date("2026-10-07T15:59:59.999Z");
  const launch = new Date(TRIVIA_PUBLIC_LAUNCH_AT);
  assert.equal(easternDateKey(launch), "2026-10-07");
  for (const env of [{}, { TRIVIA_TEST_MODE: "true" }]) {
    assert.equal(isTriviaTestMode(env, before), true);
    assert.equal(isTriviaUserEnabled("U00002", isTriviaTestMode(env, before), ["U00001"]), false);
    assert.equal(isTriviaTestMode(env, launch), false);
    assert.equal(isTriviaUserEnabled("U00002", isTriviaTestMode(env, launch), ["U00001"]), true);
    assert.equal(isTriviaUserEnabled(null, isTriviaTestMode(env, launch), []), true);
    assert.equal(isTriviaTestMode(env, new Date("2026-11-01T17:00:00Z")), false);
  }
  assert.equal(isTriviaTestMode({}, new Date(NaN)), true);
});

test("trivia patch definitions can be recognized for generic Trophy Case filtering", () => {
  assert.equal(isTriviaDefinition({ slug: "trivia_nhl_history" }), true);
  assert.equal(isTriviaDefinition({ triggerKey: "trivia:stanley_cup" }), true);
  assert.equal(isTriviaDefinition({ triggerConfig: { trivia: true } }), true);
  assert.equal(isTriviaDefinition({ slug: "beer_me", triggerKey: "calendar_year_beers" }), false);
});